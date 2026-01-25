/**
 * Canvas styling constants extracted from tldraw shape utils
 */

// Phone frame dimensions
export const PHONE_FRAME = {
  PADDING: 8,
  BORDER_RADIUS: 40, // 2.5rem equivalent
  NOTCH_WIDTH_PERCENT: 35,
  NOTCH_HEIGHT: 24,
  NOTCH_TOP: 8,
  BUTTON_WIDTH: 2,
  DEFAULT_WIDTH: 320,
  DEFAULT_HEIGHT: 640,
  BACKGROUND_COLOR: "#0B0C0E",
} as const;

// Browser frame dimensions
export const BROWSER_FRAME = {
  HEADER_HEIGHT: 40,
  BORDER_RADIUS: 12,
  TRAFFIC_LIGHT_SIZE: 10,
  TRAFFIC_LIGHT_GAP: 6,
  DEFAULT_WIDTH: 800,
  DEFAULT_HEIGHT: 600,
} as const;

// Tablet frame dimensions (between phone and browser)
export const TABLET_FRAME = {
  PADDING: 12,
  BORDER_RADIUS: 24,
  DEFAULT_WIDTH: 768,
  DEFAULT_HEIGHT: 1024,
  BACKGROUND_COLOR: "#1A1A1A",
} as const;

// Canvas behavior
export const CANVAS = {
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 4,
  ZOOM_STEP: 1.1,
  GRID_SPACING: 50,
  DEFAULT_SCREEN_GAP: 50,
  PAN_SPEED: 1,
  ANIMATION_DURATION: 300,
  SAVE_DEBOUNCE_MS: 1000,
} as const;

// Minimum dimensions for resizable screens
export const MIN_DIMENSIONS = {
  WIDTH: 200,
  HEIGHT: 200,
} as const;

// Frame dimensions by preview mode
export const FRAME_DIMENSIONS = {
  mobile: {
    width: PHONE_FRAME.DEFAULT_WIDTH + PHONE_FRAME.PADDING * 2,
    height: PHONE_FRAME.DEFAULT_HEIGHT + PHONE_FRAME.PADDING * 2,
  },
  tablet: {
    width: TABLET_FRAME.DEFAULT_WIDTH + TABLET_FRAME.PADDING * 2,
    height: TABLET_FRAME.DEFAULT_HEIGHT + TABLET_FRAME.PADDING * 2,
  },
  web: {
    width: BROWSER_FRAME.DEFAULT_WIDTH,
    height: BROWSER_FRAME.DEFAULT_HEIGHT,
  },
} as const;
