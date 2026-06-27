/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary-fixed": "#d8e2ff",
        "error": "#ba1a1a",
        "tertiary-container": "#c64f00",
        "inverse-on-surface": "#f0f0f2",
        "surface-container-lowest": "#ffffff",
        "on-secondary-fixed-variant": "#474649",
        "surface-variant": "#e2e2e4",
        "primary": "#0058bc",
        "on-secondary-fixed": "#1b1b1d",
        "on-primary-fixed": "#001a41",
        "on-surface-variant": "#414755",
        "on-surface": "#1a1c1d",
        "secondary-fixed": "#e4e2e4",
        "primary-fixed-dim": "#adc6ff",
        "on-error": "#ffffff",
        "inverse-primary": "#adc6ff",
        "secondary-fixed-dim": "#c8c6c8",
        "surface-container": "#eeeef0",
        "primary-container": "#0070eb",
        "on-primary-fixed-variant": "#004493",
        "error-container": "#ffdad6",
        "tertiary": "#9e3d00",
        "on-tertiary": "#ffffff",
        "outline-variant": "#c1c6d7",
        "on-secondary-container": "#636264",
        "on-tertiary-container": "#fffbff",
        "surface": "#f9f9fb",
        "secondary-container": "#e2dfe1",
        "on-secondary": "#ffffff",
        "on-tertiary-fixed-variant": "#7c2e00",
        "tertiary-fixed-dim": "#ffb595",
        "surface-container-low": "#f3f3f5",
        "secondary": "#5f5e60",
        "on-primary": "#ffffff",
        "on-background": "#1a1c1d",
        "surface-bright": "#f9f9fb",
        "surface-dim": "#d9dadc",
        "inverse-surface": "#2f3132",
        "tertiary-fixed": "#ffdbcc",
        "background": "#f9f9fb",
        "surface-container-highest": "#e2e2e4",
        "on-primary-container": "#fefcff",
        "on-tertiary-fixed": "#351000",
        "surface-tint": "#005bc1",
        "surface-container-high": "#e8e8ea",
        "outline": "#717786",
        "on-error-container": "#93000a"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "stack-md": "32px",
        "margin-page": "80px",
        "stack-lg": "64px",
        "margin-mobile": "24px",
        "gutter": "32px",
        "stack-xl": "120px"
      },
      fontFamily: {
        "headline-md": ["Inter"],
        "label-caps": ["Inter"],
        "body-md": ["Inter"],
        "display-lg-mobile": ["Inter"],
        "body-lg": ["Inter"],
        "display-lg": ["Inter"]
      },
      fontSize: {
        "headline-md": ["32px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "500" }],
        "label-caps": ["12px", { lineHeight: "1.2", letterSpacing: "0.1em", fontWeight: "600" }],
        "body-md": ["16px", { lineHeight: "1.5", letterSpacing: "0.01em", fontWeight: "400" }],
        "display-lg-mobile": ["40px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "600" }],
        "body-lg": ["19px", { lineHeight: "1.5", letterSpacing: "0.01em", fontWeight: "400" }],
        "display-lg": ["64px", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "600" }]
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms')
  ],
}
