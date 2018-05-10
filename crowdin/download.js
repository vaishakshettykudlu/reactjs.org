const Crowdin = require('crowdin-node');
const config = require('./config');
const path = require('path');
const {symlink, lstatSync, readdirSync} = require('fs');

const SYMLINKED_TRANSLATIONS_PATH = path.resolve(__dirname, 'translations');
const DOWNLOADED_TRANSLATIONS_PATH = path.resolve(__dirname, '__translations');
const DOWNLOADED_TRANSLATIONS_DOCS_PATH = path.resolve(
  __dirname,
  '__translations',
  'test-17', // TODO (crowdin) This is probably not part of the final export structure
  'docs'
);

const validateConfig = ({ key, threshold, url }) => {
  const errors = [];
  if (!key) {
    errors.push('key: No process.env.CROWDIN_API_KEY value defined.');
  }
  if (!Number.isInteger(threshold)) {
    errors.push(`threshold: Invalid translation threshold defined.`);
  }
  if (!url) {
    errors.push('url: No Crowdin project URL defined.');
  }
  if (errors.length > 0) {
    console.error('Invalid Crowdin config values for:\n• ' + errors.join('\n• '));

    throw Error('Invalid Crowdin config');
  }
};

function main() {
  validateConfig(config);

  const crowdin = new Crowdin({apiKey: config.key, endpointUrl: config.url});

  process.chdir(SYMLINKED_TRANSLATIONS_PATH);

  crowdin
    // .export() // Not sure if this should be called in the script since it could be very slow
    // .then(() => crowdin.downloadToPath(DOWNLOADED_TRANSLATIONS_PATH))
    .downloadToPath(DOWNLOADED_TRANSLATIONS_PATH)
    .then(() => crowdin.getTranslationStatus())
    .then(locales => {
      const usableLocales = locales
        .filter(
          locale => locale.translated_progress > config.threshold,
        )
        .map(local => local.code);

      const localeDirectories = getDirectories(
        DOWNLOADED_TRANSLATIONS_DOCS_PATH,
      );
      const localeToFolderMap = createLocaleToFolderMap(localeDirectories);

      usableLocales.forEach(locale => {
        createSymLink(localeToFolderMap.get(locale));
      });
    });
}

// Creates a relative symlink from a downloaded translation in the current working directory
// Note that the current working directory of this node process should be where the symlink is created
// or else the relative paths would be incorrect
function createSymLink(folder) {
  symlink(path.resolve(DOWNLOADED_TRANSLATIONS_DOCS_PATH, folder), folder, err => {
    if (!err) {
      return;
    }

    if (err.code === 'EEXIST') {
        `Skipped creating symlink for ${folder}. A symlink already exists.`,
      );
    } else {
      console.error(err);
      process.exit(1);
    }
  });
}

// When we run getTranslationStatus(), it typically gives us ISO 639-1 (e.g. "fr" for French) or 639-3 (e.g. "fil" for Filipino) language codes,
// But the folder structure of downloaded translations uses locale codes (e.g. "fr-FR" for French, "fil-PH" for the Philippines).
// This function creates a map between language and locale code.
function createLocaleToFolderMap(directories) {
  const localeToLanguageCode = locale => locale.includes('-') ? locale.substr(0, locale.indexOf('-')) : locale;
  const localeToFolders = new Map();
  const localeToFolder = new Map();

  for (let locale of directories) {
    const languageCode = localeToLanguageCode(locale);

    localeToFolders.set(
      languageCode,
      localeToFolders.has(languageCode)
        ? localeToFolders.get(languageCode).concat(locale)
        : [locale],
    );
  }

  localeToFolders.forEach((folders, locale) => {
    if (folders.length === 1) {
      localeToFolder.set(locale, folders[0]);
    } else {
      for (let folder of folders) {
        localeToFolder.set(folder, folder);
      }
    }
  });

  console.log(localeToFolder);
  return localeToFolder;
}

function getDirectories(source) {
  return readdirSync(source).filter(
    name =>
      lstatSync(path.join(source, name)).isDirectory() && name !== '_data',
  );
}

main();
