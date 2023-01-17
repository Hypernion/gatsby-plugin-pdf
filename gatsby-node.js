"use strict";

var _puppeteer = _interopRequireDefault(require("puppeteer"));

var _express = _interopRequireDefault(require("express"));

var _fsExtra = _interopRequireDefault(require("fs-extra"));

var _path = _interopRequireDefault(require("path"));

var sleep = require('util').promisify(setTimeout);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const DEV_PAGE = '/dev-404-page/';
const fileRegexp = RegExp('.*.(html|htm)');

const normalizePageName = (pagePath = '') => {
  const normalizedFront = pagePath.startsWith('/') ? pagePath.slice(1) : pagePath;
  const normalizedEnd = normalizedFront.endsWith('/') ? normalizedFront.slice(0, -1) : normalizedFront;
  const pageName = normalizedEnd == '' ? 'index' : normalizedEnd.replace(/\//g, '-');
  return pageName;
};

async function runWithWebServer(body) {
  return new Promise((resolve, reject) => {
    const app = (0, _express.default)();
    app.use(_express.default.static(_path.default.join(process.cwd(), 'public')));
    const server = app.listen(0, async () => {
      try {
        await body("http://localhost:" + server.address().port);
        server.close();
        resolve();
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });
}

const generatePdf = async ({
  pagePath,
  outputPath = 'public/exports',
  filePrefix,
  pdfOptions = {},
  styleTagOptions,
  index
}) => {
  await runWithWebServer(async base => {
    const delay = 1000 * index;
		await sleep(delay);
    const device_width = 1920;
  const device_height = 1080;
  const currentDir = process.cwd();
  const browser = await _puppeteer.default.launch(
    { headless: true, ignoreHTTPSErrors: true, executablePath: '/usr/bin/chromium', args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--allow-file-access-from-files', '--enable-local-file-accesses','--start-maximized'
      ],
  });
  const page = await browser.newPage();
  await page.setViewport({width: device_width, height: device_height, isMobile: false})
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36');
  await page.emulateMediaType('screen');

    const downloadDir = _path.default.join(currentDir, outputPath);

    if (!_fsExtra.default.existsSync(downloadDir)) {
      _fsExtra.default.mkdirSync(downloadDir);
    }

    await page.goto(base + pagePath, {
      waitUntil: 'networkidle0'
    });

    if (styleTagOptions) {
      await page.addStyleTag(styleTagOptions);
    }

    await page.pdf({
      path: _path.default.join(downloadDir, `${filePrefix ? filePrefix : ''}${normalizePageName(pagePath)}.pdf`),
      ...pdfOptions
    });
    await browser.close();
  });
};

exports.onPostBuild = async (options, {
  allPages = false,
  paths = [],
  ...restProps
}) => {
  const pageNodes = options.getNodes().map(({
    path
  }) => path).filter(path => path !== undefined && path !== DEV_PAGE && !fileRegexp.test(path));

  if (allPages) {
    const promisses = pageNodes.map((pagePath, index) => generatePdf({
      pagePath,
      ...restProps
    }));
    await Promise.all(promisses);
  } else {
    const promisses = paths.map(pagePath => {
      if (pageNodes.includes(pagePath)) {
        return generatePdf({
          pagePath,
          ...restProps
        });
      } else {
        console.warn(`Page path ${pagePath} for which you want generate PDF does not exist. Check gatsby-plugin-pdf configuration in your gatsby-config.js.`);
      }
    });
    await Promise.all(promisses);
  }
};

exports.pluginOptionsSchema = ({
  Joi
}) => {
  return Joi.object({
    allPages: Joi.boolean().default(`false`).description(`When true all pages will be converted to PDF files.`),
    filePrefix: Joi.string().description(`Optional prefix for exported PDF file`),
    outputPath: Joi.string().default(`/public/exports`).description(`Optional path where to store generated PDFs. Relative to current project dir.`),
    paths: Joi.array().items(Joi.string()).min(1).description(`Array of page paths to convert to PDF. Path have to start with a leading /. You can pass nested paths like '/path/subpath'. For the root path use just single '/'.`),
    pdfOptions: Joi.object().description(`See pdf puppeteer options: https://github.com/puppeteer/puppeteer/blob/v5.5.0/docs/api.md#pagepdfoptions.`),
    styleTagOptions: Joi.object({
      url: Joi.string().description(`URL of the <link> tag`),
      path: Joi.string().description(`Path to the CSS file to be injected into frame. If path is a relative path, then it is resolved relative to current working directory.`),
      content: Joi.string().description(`Raw CSS content to be injected into frame.`)
    }).description(`See addStyleTag puppeteer options: https://github.com/puppeteer/puppeteer/blob/v5.5.0/docs/api.md#pageaddstyletagoptions.`)
  });
};