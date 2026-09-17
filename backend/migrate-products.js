const fs = require("fs");
const path = require("path");

const backendFolder = __dirname;
const databaseFolder = path.join(backendFolder, "..", "database");

const sourceFile = path.join(
    backendFolder,
    "products.json"
);

const targetFile = path.join(
    databaseFolder,
    "products.json"
);

if (!fs.existsSync(databaseFolder)) {
    fs.mkdirSync(databaseFolder, {
        recursive: true
    });
}

if (!fs.existsSync(sourceFile)) {
    console.error(
        "❌ Source products.json tidak dijumpai:"
    );
    console.error(sourceFile);
    process.exit(1);
}

const products =
    JSON.parse(
        fs.readFileSync(
            sourceFile,
            "utf8"
        )
    );

function cleanValue(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return "";
    }

    return String(value).trim();
}

function addAttribute(
    attributes,
    key,
    value
) {
    value = cleanValue(value);

    if (value) {
        attributes[key] = value;
    }
}

function parseWatchVariant(name) {
    const result = {};

    const match =
        String(name || "").match(
            /^(\d+mm)\s*-\s*(.+)$/i
        );

    if (match) {
        result.size = match[1];
        result.color = match[2].trim();
    }

    return result;
}

function parseMacVariant(
    product,
    variant
) {
    const attributes = {};

    const name =
        cleanValue(variant.name);

    const oldStorage =
        cleanValue(variant.storage);

    const oldColor =
        cleanValue(variant.color);

    /*
     * MacBook / iMac / Mac mini
     *
     * Old database sometimes stored RAM
     * inside "storage".
     */

    if (
        oldStorage &&
        /^\d+(?:\.\d+)?\s*(GB|TB)$/i.test(
            oldStorage
        )
    ) {
        addAttribute(
            attributes,
            "ram",
            oldStorage
        );
    }

    /*
     * Detect SSD/storage from variant name.
     *
     * Examples:
     * 512GB
     * 1TB
     * 512GB SSD
     */

    const storageMatch =
        name.match(
            /(\d+(?:\.\d+)?\s*(?:GB|TB))\s*(?:SSD)?/i
        );

    if (storageMatch) {
        const capacity =
            storageMatch[1]
                .replace(/\s+/g, "")
                .toUpperCase();

        /*
         * Avoid treating RAM as storage
         * when the same value appears first.
         */
        if (
            !(
                oldStorage &&
                capacity ===
                    oldStorage
                        .replace(/\s+/g, "")
                        .toUpperCase()
            ) ||
            /SSD/i.test(name)
        ) {
            addAttribute(
                attributes,
                "storage",
                capacity
            );
        }
    }

    /*
     * Existing old color field.
     */
    if (
        oldColor &&
        !/^\d+(?:\.\d+)?\s*(GB|TB)$/i.test(
            oldColor
        )
    ) {
        addAttribute(
            attributes,
            "color",
            oldColor
        );
    }

    /*
     * Product 52:
     * MacBook Air M5
     *
     * Old data:
     * storage = 16GB
     * color = 512GB
     *
     * Real color comes from variant ID.
     */

    if (
        String(product.id) === "52"
    ) {
        const id =
            String(
                variant.id || ""
            ).toLowerCase();

        const colorMap = {
            "sky-blue": "Sky Blue",
            "midnight": "Midnight",
            "starlight": "Starlight",
            "silver": "Silver",
            "space-gray": "Space Gray"
        };

        for (
            const key of Object.keys(
                colorMap
            )
        ) {
            if (
                id.endsWith(
                    `-${key}`
                )
            ) {
                attributes.color =
                    colorMap[key];
                break;
            }
        }

        if (oldStorage) {
            attributes.ram =
                oldStorage;
        }

        if (
            oldColor &&
            /^\d+(?:\.\d+)?\s*(GB|TB)$/i.test(
                oldColor
            )
        ) {
            attributes.storage =
                oldColor
                    .replace(/\s+/g, "")
                    .toUpperCase();
        }
    }

    /*
     * Mac Studio:
     *
     * Example:
     * M5 Max - 36GB - 512GB SSD
     */

    if (
        String(product.name || "")
            .toLowerCase()
            .includes("mac studio")
    ) {
        const chipMatch =
            name.match(
                /^(M\d(?:\s+(?:Pro|Max|Ultra))?)/i
            );

        if (chipMatch) {
            attributes.chip =
                chipMatch[1];
        }

        const ramMatch =
            name.match(
                /-\s*(\d+(?:\.\d+)?\s*GB)\s*-/i
            );

        if (ramMatch) {
            attributes.ram =
                ramMatch[1]
                    .replace(/\s+/g, "")
                    .toUpperCase();
        }

        const ssdMatch =
            name.match(
                /(\d+(?:\.\d+)?\s*(?:GB|TB))\s*SSD/i
            );

        if (ssdMatch) {
            attributes.storage =
                `${ssdMatch[1]
                    .replace(/\s+/g, "")
                    .toUpperCase()} SSD`;
        }
    }

    return attributes;
}

function parseVariant(
    product,
    variant
) {
    const attributes = {};

    const name =
        cleanValue(variant.name);

    const productName =
        cleanValue(product.name)
            .toLowerCase();

    /*
     * Existing attributes.
     */

    addAttribute(
        attributes,
        "storage",
        variant.storage
    );

    addAttribute(
        attributes,
        "color",
        variant.color ||
            variant.colour
    );

    /*
     * iPhone / generic products.
     */
    if (
        variant.storage &&
        variant.color
    ) {
        attributes.storage =
            cleanValue(
                variant.storage
            );

        attributes.color =
            cleanValue(
                variant.color
            );
    }

    /*
     * Apple Watch.
     */
    if (
        productName.includes(
            "apple watch"
        )
    ) {
        const watch =
            parseWatchVariant(
                name
            );

        Object.assign(
            attributes,
            watch
        );
    }

    /*
     * Mac products.
     */
    if (
        productName.includes("macbook") ||
        productName.includes("imac") ||
        productName.includes("mac mini") ||
        productName.includes("mac studio")
    ) {
        const mac =
            parseMacVariant(
                product,
                variant
            );

        Object.assign(
            attributes,
            mac
        );
    }

    /*
     * Product 52 special repair.
     */
    if (
        String(product.id) === "52"
    ) {
        const id =
            String(
                variant.id || ""
            ).toLowerCase();

        const colorMap = {
            "sky-blue": "Sky Blue",
            "midnight": "Midnight",
            "starlight": "Starlight",
            "silver": "Silver",
            "space-gray": "Space Gray"
        };

        for (
            const key of Object.keys(
                colorMap
            )
        ) {
            if (
                id.endsWith(
                    `-${key}`
                )
            ) {
                attributes.color =
                    colorMap[key];
            }
        }

        if (variant.storage) {
            attributes.ram =
                variant.storage;
        }

        if (
            variant.color &&
            /^\d+(?:\.\d+)?\s*(GB|TB)$/i.test(
                variant.color
            )
        ) {
            attributes.storage =
                variant.color
                    .replace(/\s+/g, "")
                    .toUpperCase();
        }
    }

    /*
     * Name-only variants.
     *
     * Preserve the variant identity
     * instead of losing the information.
     */
    if (
        Object.keys(attributes)
            .length === 0 &&
        name
    ) {
        attributes.label = name;
    }

    return {
        ...variant,

        attributes
    };
}

const normalizedProducts =
    products.map(product => {
        const normalized = {
            ...product
        };

        if (
            Array.isArray(
                product.variants
            )
        ) {
            normalized.variants =
                product.variants.map(
                    variant =>
                        parseVariant(
                            product,
                            variant
                        )
                );
        }

        return normalized;
    });

/*
 * Backup existing new database.
 */
if (
    fs.existsSync(targetFile)
) {
    const backupFile =
        path.join(
            databaseFolder,
            `products.backup-${Date.now()}.json`
        );

    fs.copyFileSync(
        targetFile,
        backupFile
    );

    console.log(
        `📦 Backup dibuat: ${backupFile}`
    );
}

/*
 * Save new database.
 */
fs.writeFileSync(
    targetFile,
    JSON.stringify(
        normalizedProducts,
        null,
        4
    ),
    "utf8"
);

console.log("");
console.log(
    "======================================"
);
console.log(
    "   ZIQTECH PRODUCT DATABASE MIGRATION"
);
console.log(
    "======================================"
);
console.log("");
console.log(
    `✅ Products migrated: ${normalizedProducts.length}`
);
console.log(
    `✅ New database: ${targetFile}`
);
console.log("");
console.log(
    "Migration berjaya."
);