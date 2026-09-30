import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16 ships native flat configs. Loading the old
// "next/core-web-vitals" names through FlatCompat crashes with
// "Converting circular structure to JSON".
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // New in eslint-plugin-react-hooks 7. It flags the ordinary
      // "load data when the screen opens" pattern (useEffect -> load() ->
      // setState after fetch), which every admin tab uses and which is fine.
      // Off so real problems are not buried; set to "warn" to see them.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Tailwind's config file is CommonJS-style and loads its plugin with require().
    files: ["tailwind.config.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // A malformed or empty body makes req.json() throw, which is a 500 with
    // no JSON. Use readJson(req) from @/lib/api-helpers instead: it returns
    // null, which the Zod schema turns into a clean 400.
    files: ["src/app/api/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name=/^_?req(uest)?$/][callee.property.name='json']",
          message: "Use readJson(req) from @/lib/api-helpers instead of req.json().",
        },
      ],
    },
  },
]);

export default eslintConfig;
