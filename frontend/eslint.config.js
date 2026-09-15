import js from "@eslint/js";
import react from "eslint-plugin-react";

export default [
    js.configs.recommended,
    {
        files: ["**/*.jsx"],
        plugins: { react },
        languageOptions: {
            parserOptions: {
                ecmaFeatures: { jsx: true }
            },
            globals: {
                document: "readonly",
                console: "readonly",
                window: "readonly",
                URL: "readonly",
                Blob: "readonly",
                FileReader: "readonly",
                Uint8Array: "readonly",
                localStorage: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                Set: "readonly",
                Map: "readonly",
                Array: "readonly",
                React: "readonly",
            }
        },
        rules: {
            "no-undef": "error"
        }
    }
];
