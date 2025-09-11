import { createTamagui } from '@tamagui/core'
import { defaultConfig } from '@tamagui/config/v4'
import { createInterFont } from '@tamagui/font-inter'
import { createAnimations } from '@tamagui/animations-react-native'

const interFont = createInterFont()

const animations = createAnimations({
  bouncy: {
    type: 'spring',
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
  lazy: {
    type: 'spring',
    damping: 20,
    stiffness: 60,
  },
  quick: {
    type: 'spring',
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
})

const config = createTamagui({
  ...defaultConfig,
  animations,
  fonts: {
    ...defaultConfig.fonts,
    heading: interFont,
    body: interFont,
  },
  themes: {
    ...defaultConfig.themes,
    light: {
      ...defaultConfig.themes.light,
      background: '#ffffff',
      backgroundHover: '#f8f9fa',
      backgroundPress: '#f1f3f4',
      backgroundFocus: '#e8f0fe',
      color: '#000000',
      colorHover: '#1a1a1a',
      colorPress: '#0f0f0f',
      colorFocus: '#0066cc',
      borderColor: '#e1e1e1',
      borderColorHover: '#d4d4d4',
      borderColorPress: '#b8b8b8',
      borderColorFocus: '#0066cc',
    },
    dark: {
      ...defaultConfig.themes.dark,
      background: '#000000',
      backgroundHover: '#1a1a1a',
      backgroundPress: '#2a2a2a',
      backgroundFocus: '#1e3a8a',
      color: '#ffffff',
      colorHover: '#f0f0f0',
      colorPress: '#e0e0e0',
      colorFocus: '#3b82f6',
      borderColor: '#38383a',
      borderColorHover: '#4a4a4a',
      borderColorPress: '#5a5a5a',
      borderColorFocus: '#3b82f6',
    },
  },
})

export default config

export type Conf = typeof config

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}