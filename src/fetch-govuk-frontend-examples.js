const yaml = require('js-yaml');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const got = require('got');
const cliProgress = require('cli-progress');
const govukPackage = require('govuk-frontend/package.json');
const getGovukComponentList = require('./get-govuk-component-list');

const fetchExamplesProgress = new cliProgress.SingleBar(
  {
    format:
      'Fetching examples from govuk-frontend GitHub {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
  },
  cliProgress.Presets.shades_classic
);

function fetchExample(name) {
  // Collect examples from govuk-frontend on github
  const cachePath = `.cache/govuk-frontend-examples/${name}.json`;

  return got(
    `https://raw.githubusercontent.com/alphagov/govuk-frontend/v${govukPackage.version}/src/govuk/components/${name}/${name}.yaml`
  )
    .then((response) => response.body)
    .then((data) => yaml.safeLoad(data))
    .then(
      (govExamples) =>
        new Promise(function (resolve, reject) {
          mkdirp.sync(path.dirname(cachePath));
          fs.writeFile(cachePath, JSON.stringify(govExamples), (err) => {
            if (err) {
              console.error(err);
              reject(err);
            }

            fetchExamplesProgress.increment();

            resolve({ name, data: govExamples });
          });
        })
    );
}

async function fetchExamples() {
  const components = getGovukComponentList();

  fetchExamplesProgress.start(components.length, 0);

  const promises = components.map(fetchExample);

  return Promise.all(promises)
    .then(function (examples) {
      fetchExamplesProgress.stop();
      return examples;
    })
    .then((examples) =>
      examples.reduce(
        (accumulator, example) => ({
          ...accumulator,
          [example.name]: example.data,
        }),
        {}
      )
    )
    .then(
      (examples) =>
        new Promise(function (resolve, reject) {
          fs.writeFile(
            `.cache/govuk-frontend-examples/all.json`,
            JSON.stringify(examples),
            (err) => {
              if (err) {
                console.error(err);
                reject(err);
              }

              resolve(examples);
            }
          );
        })
    );
}

module.exports = fetchExamples;
