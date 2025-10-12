import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
    darkMode: ['class'],
    content: ['./src/renderer/**/*.{ts,tsx,js,jsx}', './src/ui/**/*.html', './src/ui/**/*.js'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', ...fontFamily.sans],
            },
        },
    },
    plugins: [require('tailwindcss-animate')],
};

export default config;
