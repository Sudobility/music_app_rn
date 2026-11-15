/**
 * Windows stub for `react-native-localize`.
 *
 * react-native-localize ships no Windows native module (and is excluded from
 * Windows autolinking in react-native.config.js), so any call into it reaches
 * `TurboModuleRegistry.getEnforcing('RNLocalize')` and throws. The shared i18n
 * helper's own `deviceLocale.windows` (which reads the locale from `Intl`) is
 * not picked up because the published ESM imports it with an explicit `.js`
 * extension, which bypasses Metro's platform-suffix resolution. This stub
 * keeps `require('react-native-localize')` from touching the native registry
 * on Windows; the real device locale comes from `Intl` elsewhere.
 */
module.exports = {
  getLocales: () => [],
  findBestLanguageTag: () => undefined,
  getNumberFormatSettings: () => ({
    decimalSeparator: '.',
    groupingSeparator: ',',
  }),
  getCalendar: () => 'gregorian',
  getCountry: () => 'US',
  getCurrencies: () => [],
  getTemperatureUnit: () => 'celsius',
  getTimeZone: () => 'UTC',
  uses24HourClock: () => false,
  usesMetricSystem: () => true,
  usesAutoDateAndTime: () => undefined,
  usesAutoTimeZone: () => undefined,
  addEventListener: () => {},
  removeEventListener: () => {},
};
