const nunjucks = require('nunjucks');
const ent = require('ent');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cliProgress = require('cli-progress');
const prettyhtml = require('@starptech/prettyhtml');
const yaml = require('js-yaml');
const chalk = require('chalk');
const { HtmlDiffer } = require('@markedjs/html-differ');
const diffLogger = require('@markedjs/html-differ/lib/logger');
const getGovukComponentList = require('./get-govuk-component-list');
const fetchGovukFrontend = require('./fetch-govuk-frontend');
const config = require('./config');

const htmlDiffer = new HtmlDiffer({
  ignoreAttributes: [],
  ignoreSelfClosingSlash: true,
});

const testProgress = new cliProgress.SingleBar(
  {
    format: 'Running tests {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
  },
  cliProgress.Presets.shades_classic
);

function cleanHtml(dirtyHtml) {
  return prettyhtml(ent.decode(dirtyHtml), {
    sortAttributes: true,
  }).contents;
}

async function diffSingleComponentExample(
  component,
  example,
  renderCallback,
  nunjucksEnv
) {
  const expected = cleanHtml(
    nunjucksEnv.render(
      path.join('src/govuk/components', component, 'template.njk'),
      {
        params: example.data,
      }
    )
  );

  const actual = cleanHtml(renderCallback({ component, params: example.data }));

  const isEqual = await htmlDiffer.isEqual(actual, expected);
  const diff = await htmlDiffer.diffHtml(actual, expected);

  return new Promise((resolve, reject) => {
    resolve({
      passed: isEqual,
      example: example.name,
      diff,
    });
  });
}

async function diffSingleComponent(
  component,
  version,
  renderCallback,
  nunjucksEnv
) {
  testProgress.increment();

  const examples = yaml.safeLoad(
    fs.readFileSync(
      path.join(
        config.tempDirectory,
        version,
        'src/govuk/components',
        component,
        `${component}.yaml`
      ),
      'utf8'
    )
  );

  const results = await Promise.all(
    examples.examples.map((example) =>
      diffSingleComponentExample(
        component,
        example,
        renderCallback,
        nunjucksEnv
      )
    )
  );

  return new Promise(function (resolve, reject) {
    resolve({
      component,
      results,
    });
  });
}

async function diffTemplate(version, renderCallback, nunjucksEnv) {
  testProgress.increment();

  const examples = [
    {
      name: 'simple use case overriding the most common elements',
      data: {
        pageTitle: '<p>pageTitle</p>',
        header: '<p>header</p>',
        content: '<p>content</p>',
        footer: '<p>footer</p>',
      },
    },
    {
      name: 'everything overridden except main block',
      data: {
        // Variables
        htmlLang: 'htmlLang',
        htmlClasses: 'htmlClasses',
        pageTitleLang: 'pageTitleLang',
        themeColor: 'themeColor',
        bodyClasses: 'bodyClasses',
        bodyAttributes: {
          foo: 'bar',
          wibble: 'bob',
        },
        containerClasses: 'containerClasses',
        mainClasses: 'mainClasses',
        mainLang: 'mainLang',
        // Blocks
        pageTitle: '<p>pageTitle</p>',
        headIcons: '<p>headIcons</p>',
        head: '<p>head</p>',
        bodyStart: '<p>bodyStart</p>',
        skipLink: '<p>skipLink</p>',
        header: '<p>header</p>',
        beforeContent: '<p>beforeContent</p>',
        content: '<p>content</p>',
        footer: '<p>footer</p>',
        bodyEnd: '<p>bodyEnd</p>',
      },
    },
    {
      name: 'override main block',
      data: {
        main: '<p>footer</p>',
      },
    },
  ];

  const results = await Promise.all(
    examples.map((example) =>
      (async () => {
        const expected = cleanHtml(
          nunjucksEnv.render('base-template.njk', example.data)
        );

        const actual = cleanHtml(
          renderCallback({ template: true, params: example.data })
        );

        const isEqual = await htmlDiffer.isEqual(actual, expected);
        const diff = await htmlDiffer.diffHtml(actual, expected);

        return new Promise((resolve, reject) => {
          resolve({
            passed: isEqual,
            example: example.name,
            diff,
          });
        });
      })()
    )
  );

  return new Promise(function (resolve, reject) {
    resolve({
      component: 'page-template',
      results,
    });
  });
}

async function diffComponentAgainstReferenceNunjucks(
  version,
  renderCallback,
  options
) {
  await fetchGovukFrontend(version, options);
  const components = getGovukComponentList(version, options).filter((item) => {
    if (options.exclude && options.exclude.includes(item)) {
      return false;
    }

    if (options.include && !options.include.includes(item)) {
      return false;
    }

    return true;
  });

  testProgress.start(components.length);

  const nunjucksEnv = new nunjucks.Environment([
    new nunjucks.FileSystemLoader(__dirname),
    new nunjucks.FileSystemLoader(path.join(config.tempDirectory, version)),
  ]);

  const promises = components.map((component) =>
    diffSingleComponent(component, version, renderCallback, nunjucksEnv)
  );

  if (
    (options.exclude && !options.exclude.includes('page-template')) ||
    (options.include && options.include.includes('page-template'))
  ) {
    testProgress.setTotal(testProgress.getTotal() + 1);
    promises.push(diffTemplate(version, renderCallback, nunjucksEnv));
  }

  const results = await Promise.all(promises);

  testProgress.stop();

  let total = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  results.forEach((result) => {
    const groupName = chalk.whiteBright.bold(result.component);
    console.group(groupName);

    result.results.forEach((individualResult) => {
      total += 1;

      console.log(
        chalk.whiteBright.bold('→'),
        individualResult.example,
        individualResult.passed
          ? chalk.greenBright.bold('✔')
          : chalk.redBright.bold('✘')
      );
      if (individualResult.passed) {
        totalPassed += 1;
      } else {
        diffLogger.logDiffText(individualResult.diff, { charsAroundDiff: 80 });
        console.log(os.EOL);
        totalFailed += 1;
      }
    });

    console.groupEnd(groupName);
  });

  console.log(os.EOL);
  console.group(chalk.whiteBright.bold('Results'));
  console.log(total, ' tests.');
  console.log(
    chalk.greenBright(totalPassed),
    ' passed and ',
    chalk.redBright(totalFailed),
    ' failed'
  );
  console.groupEnd('Results');

  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

module.exports = diffComponentAgainstReferenceNunjucks;
