const nunjucks = require('nunjucks');
const yargs = require('yargs');
const path = require('path');

const config = require('../../src/config');

process.on('unhandledRejection', (err) => {
  throw err;
});

(async () => {
  const { argv } = yargs
    .option('govuk-frontend-version')
    .option('component')
    .option('template', {
      type: 'boolean',
    })
    .option('params');

  const nunjucksEnv = new nunjucks.Environment([
    new nunjucks.FileSystemLoader(
      path.join(config.tempDirectory, argv['govuk-frontend-version'])
    ),
  ]);

  function hyphenatedToCamel(string) {
    return string
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  }

  if (argv.component) {
    const macroName = hyphenatedToCamel(argv.component);
    const template = `{% from "src/govuk/components/${argv.component}/macro.njk" import govuk${macroName} %}
                {{ govuk${macroName}(params) }}`;

    process.stdout.write(
      nunjucksEnv
        .renderString(template, { params: JSON.parse(argv.params) })
        .trim()
    );
  } else if (argv.template) {
    const template = `
        {% extends "src/govuk/template.njk" %}
        {% block pageTitle %}{% if pageTitle %}{{ pageTitle }} {% else %} {{ super() }} {% endif %} {% endblock %}
        {% block headIcons %} {% if headIcons %} {{ headIcons }} {% else %} {{ super() }} {% endif %} {% endblock %}
        {% block head %} {% if head %} {{ head }} {% else %} {{ super() }} {% endif %} {% endblock %}
        {% block bodyStart %} {% if bodyStart %} {{ bodyStart }} {% else %} {{ super() }} {% endif %} {% endblock %}
        {% block skipLink %} {% if skipLink %} {{ skipLink }} {% else %} {{ super() }} {% endif %} {% endblock %}
        {% block header %} {% if header %} {{ header }} {% else %} {{ super() }} {% endif %} {% endblock %}
        {% block main %} {% if main %} {{ main }} {% else %} {{ super() }} {% endif %} {% endblock %}
        {% block beforeContent %} {% if beforeContent %} {{ beforeContent }} {% else %} {{ super() }} {% endif %} {% endblock %}
        {% block content %} {% if content %} {{ content }} {% else %} {{ super() }} {% endif %} {% endblock %}
        {% block footer %} {% if footer %} {{ footer }} {% else %} {{ super() }} {% endif %} {% endblock %}
        {% block bodyEnd %} {% if bodyEnd %} {{ bodyEnd }} {% else %} {{ super() }} {% endif %} {% endblock %}
    `;

    process.stdout.write(
      nunjucksEnv.renderString(template, JSON.parse(argv.params))
    );
  }
})();
