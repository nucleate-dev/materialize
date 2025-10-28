import { defaultConfig } from '@tamagui/config/v4';
import { createTamagui } from 'tamagui';

const config = createTamagui(defaultConfig);

export type AppConfig = typeof config;

export default config;
