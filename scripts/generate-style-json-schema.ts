import { createGenerator, type Config } from "ts-json-schema-generator";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));


console.log("Generating JSON Schema from MapLibre types...");

try {

    for (const type of ['BasemapConfig', 'OverlayConfig']) {
        const config: Config = {
            // Point to our bridge file, not directly into node_modules
            path: path.resolve(__dirname, "../frontend/src/utils/layerTypes.ts"),
            tsconfig: path.resolve(__dirname, "../frontend/tsconfig.json"),

            // The specific TypeScript type we want to convert
            type,

            // Include all referenced types in the definitions
            expose: "all",

            // Parse JSDoc comments into "description" fields in the schema
            jsDoc: "extended",

            // Ensure top-level references work correctly
            topRef: true,

            // Skip validating type check errors (MapLibre types can be complex)
            skipTypeCheck: true
        };

        const generator = createGenerator(config);

        const schema = generator.createSchema(type);

        schema.title = `Where2Go ${type}`;
        schema.$id = `where2go/${type.toLowerCase()}-config.json`;

        // Write to file
        const outputPath = path.resolve(__dirname, "../schema/", `${type.toLowerCase()}.schema.json`);
        const schemaString = JSON.stringify(schema, null, 2);

        fs.writeFileSync(outputPath, schemaString);
        console.log(`Created: ${outputPath}`);
    }

} catch (error) {
    console.error("❌ Error generating schema:");
    console.error(error);
}
