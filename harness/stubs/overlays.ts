// Test stand-in for Windy's overlays: the wave layers share the 'waves' colour scale.
import colors from './colors';
const wave = { overlayColor: colors.waves };
const overlays: Record<string, { overlayColor: unknown }> = { waves: wave, wwaves: wave, swell1: wave, swell2: wave, swell: wave, wind: { overlayColor: colors.wind } };
export default overlays;
