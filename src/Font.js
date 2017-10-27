// @flow

import invariant from 'invariant';
import { NativeModules } from 'react-native';

import Asset from './Asset';
import Constants from './Constants';

type FontSource = string | number | Asset;

const loaded: { [name: string]: boolean } = {};
const loadPromises: { [name: string]: Promise<void> } = {};

export function processFontFamily(name: ?string): ?string {
  if (!name || Constants.systemFonts.includes(name) || name === 'System') {
    return name;
  }

  if (name.includes(Constants.sessionId)) {
    return name;
  }

  if (!isLoaded(name)) {
    if (__DEV__) {
      if (isLoading(name)) {
        console.error(
          `You started loading '${name}', but used it before it finished loading\n\n` +
            `- You need to wait for Expo.Font.loadAsync to complete before using the font.\n\n` +
            `- We recommend loading all fonts before rendering the app, and rendering only ` +
            `Expo.AppLoading while waiting for loading to complete.`
        );
      } else {
        console.error(
          `fontFamily '${name}' is not a system font and has not been loaded through ` +
            `Expo.Font.loadAsync.\n\n` +
            `- If you intended to use a system font, make sure you typed the name ` +
            `correctly and that it is supported by your device operating system.\n\n` +
            `- If this is a custom font, be sure to load it with Expo.Font.loadAsync.`
        );
      }
    }

    return 'System';
  }

  return `ExponentFont-${_getNativeFontName(name)}`;
}

export function isLoaded(name: string): boolean {
  return loaded.hasOwnProperty(name);
}

export function isLoading(name: string): boolean {
  return loadPromises.hasOwnProperty(name);
}

export async function loadAsync(
  nameOrMap: string | { [string]: FontSource },
  uriOrModuleOrAsset?: FontSource
): Promise<void> {
  if (typeof nameOrMap === 'object') {
    const fontMap = nameOrMap;
    const names = Object.keys(fontMap);
    await Promise.all(names.map(name => loadAsync(name, fontMap[name])));
    return;
  }

  const name = nameOrMap;

  if (loaded[name]) {
    return;
  }

  if (loadPromises[name]) {
    return loadPromises[name];
  }

  // Important: we want all callers that concurrently try to load the same font to await the same
  // promise. If we're here, we haven't created the promise yet. To ensure we create only one
  // promise in the program, we need to create the promise synchronously without yielding the event
  // loop from this point.

  invariant(uriOrModuleOrAsset, `No source from which to load font "${name}"`);
  const asset = _getAssetForSource(uriOrModuleOrAsset);
  loadPromises[name] = (async () => {
    try {
      await _loadSingleFontAsync(name, asset);
      loaded[name] = true;
    } finally {
      delete loadPromises[name];
    }
  })();

  await loadPromises[name];
}

function _getAssetForSource(uriOrModuleOrAsset: FontSource): Asset {
  if (typeof uriOrModuleOrAsset === 'string') {
    // TODO(nikki): need to implement Asset.fromUri(...)
    // asset = Asset.fromUri(uriOrModuleOrAsset);
    throw new Error(
      'Loading fonts from remote URIs is temporarily not supported. Please download the font file and load it using require. See: https://docs.expo.io/versions/latest/guides/using-custom-fonts.html#downloading-the-font'
    );
  }

  if (typeof uriOrModuleOrAsset === 'number') {
    return Asset.fromModule(uriOrModuleOrAsset);
  }

  return uriOrModuleOrAsset;
}

async function _loadSingleFontAsync(name: string, asset: Asset): Promise<void> {
  await asset.downloadAsync();
  if (!asset.downloaded) {
    throw new Error(`Failed to download asset for font "${name}"`);
  }

  await NativeModules.ExponentFontLoader.loadAsync(_getNativeFontName(name), asset.localUri);
}

type StyleOptions = {
  ignoreWarning?: boolean,
};

export function style(name: ?string, options: StyleOptions = {}): { [string]: mixed } {
  console.warn(
    `Expo.Font.style() is deprecated and will be removed in SDK 24. After loading a font with a specified name with Font.loadAsync, you can just reference that font in the fontFamily of your component's style.`
  );

  if (!name) {
    return {
      fontFamily: undefined,
    };
  }

  if (!loaded[name] && !options.ignoreWarning) {
    console.warn(`[Expo.Font] No font "${name}", or it hasn't been loaded yet`);
  }
  return {
    fontFamily: `ExponentFont-${_getNativeFontName(name)}`,
  };
}

function _getNativeFontName(name: string): string {
  return `${Constants.sessionId}-${name}`;
}
