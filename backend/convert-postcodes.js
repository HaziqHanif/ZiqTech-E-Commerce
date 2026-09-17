
const fs = require("fs");
const path = require("path");
const https = require("https");

const BASE_URL =
    "https://raw.githubusercontent.com/AsyrafHussin/malaysia-postcodes/main/";

const STATES = [
    "johor",
    "kedah",
    "kelantan",
    "kuala_lumpur",
    "labuan",
    "melaka",
    "negeri_sembilan",
    "pahang",
    "perak",
    "perlis",
    "pulau_pinang",
    "putrajaya",
    "sabah",
    "sarawak",
    "selangor",
    "terengganu"
];

const outputFile = path.join(
    __dirname,
    "malaysia-postcodes.json"
);


function download(url) {

    return new Promise((resolve, reject) => {

        https.get(
            url,
            {
                headers: {
                    "User-Agent":
                        "ZiqTech Postcode Generator"
                }
            },
            response => {

                // Handle redirect
                if (
                    response.statusCode >= 300 &&
                    response.statusCode < 400 &&
                    response.headers.location
                ) {

                    return download(
                        response.headers.location
                    )
                        .then(resolve)
                        .catch(reject);
                }


                if (response.statusCode !== 200) {

                    reject(
                        new Error(
                            `HTTP ${response.statusCode}`
                        )
                    );

                    return;
                }


                let data = "";

                response.setEncoding(
                    "utf8"
                );


                response.on(
                    "data",
                    chunk => {
                        data += chunk;
                    }
                );


                response.on(
                    "end",
                    () => resolve(data)
                );


                response.on(
                    "error",
                    reject
                );

            }
        ).on(
            "error",
            reject
        );

    });

}


async function main() {

    console.log("");
    console.log(
        "============================================"
    );
    console.log(
        " ZIQTECH MALAYSIA POSTCODE DATABASE"
    );
    console.log(
        "============================================"
    );
    console.log("");


    const database = {};


    for (const stateFile of STATES) {

        const url =
            `${BASE_URL}${stateFile}.json`;


        process.stdout.write(
            `Downloading ${stateFile}.json ... `
        );


        try {

            const raw =
                await download(url);


            const state =
                JSON.parse(raw);


            const stateName =
                String(
                    state.name || ""
                ).trim();


            const cities =
                Array.isArray(
                    state.city
                )
                    ? state.city
                    : [];


            let postcodeCount = 0;


            for (
                const city of cities
            ) {

                const cityName =
                    String(
                        city.name || ""
                    ).trim();


                const postcodes =
                    Array.isArray(
                        city.postcode
                    )
                        ? city.postcode
                        : [];


                for (
                    const postcode
                    of postcodes
                ) {

                    const code =
                        String(
                            postcode
                        )
                            .replace(
                                /\D/g,
                                ""
                            )
                            .padStart(
                                5,
                                "0"
                            );


                    if (
                        !/^\d{5}$/.test(
                            code
                        )
                    ) {
                        continue;
                    }


                    /*
                     * Exact postcode.
                     *
                     * Don't overwrite an existing
                     * entry if the same postcode
                     * appears twice.
                     */

                    if (
                        !database[code]
                    ) {

                        database[code] = {
                            city:
                                cityName,

                            state:
                                stateName
                        };

                        postcodeCount++;
                    }

                }

            }


            console.log(
                `OK (${postcodeCount} postcodes)`
            );

        } catch (error) {

            console.log(
                `FAILED: ${error.message}`
            );

        }

    }


    /*
    ========================================================
    SAVE DATABASE
    ========================================================
    */

    fs.writeFileSync(
        outputFile,
        JSON.stringify(
            database,
            null,
            2
        ),
        "utf8"
    );


    const total =
        Object.keys(
            database
        ).length;


    console.log("");
    console.log(
        "============================================"
    );

    console.log(
        " DATABASE CREATED"
    );

    console.log(
        "============================================"
    );

    console.log("");

    console.log(
        `Total postcodes: ${total}`
    );

    console.log("");

    /*
    ========================================================
    TEST IMPORTANT POSTCODES
    ========================================================
    */

    console.log(
        "84400:"
    );

    console.log(
        database["84400"] ||
        "NOT FOUND"
    );

    console.log("");

    console.log(
        "47620:"
    );

    console.log(
        database["47620"] ||
        "NOT FOUND"
    );

    console.log("");

    console.log(
        "55188:"
    );

    console.log(
        database["55188"] ||
        "NOT FOUND"
    );

    console.log("");

    console.log(
        "80888:"
    );

    console.log(
        database["80888"] ||
        "NOT FOUND"
    );

    console.log("");

    console.log(
        `Saved to: ${outputFile}`
    );

    console.log("");

}


main().catch(
    error => {

        console.error(
            "❌ Fatal error:",
            error
        );

        process.exit(1);

    }
);
