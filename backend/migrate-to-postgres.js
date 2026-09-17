const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const client = new Client({
    user: "haziqhanif",
    host: "localhost",
    database: "ziqtech",
    port: 5432
});

const projectFolder = path.join(__dirname, "..");

const usersFile = path.join(
    projectFolder,
    "database",
    "users.json"
);

const productsFile = path.join(
    projectFolder,
    "database",
    "products.json"
);

const ordersFile = path.join(
    projectFolder,
    "backend",
    "orders.json"
);

const postcodesFile = path.join(
    projectFolder,
    "backend",
    "malaysia-postcodes.json"
);

function readJson(file) {
    return JSON.parse(
        fs.readFileSync(file, "utf8")
    );
}

async function migrateUsers() {

    console.log("\n👤 Migrating users...");

    const users = readJson(usersFile);

    for (const user of users) {

        await client.query(
            `
            INSERT INTO users (
                id,
                name,
                email,
                password_hash,
                role,
                created_at,
                created_by,
                phone,
                address,
                postcode,
                city,
                state,
                profile_photo
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
            )
            ON CONFLICT (id)
            DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                created_at = EXCLUDED.created_at,
                created_by = EXCLUDED.created_by,
                phone = EXCLUDED.phone,
                address = EXCLUDED.address,
                postcode = EXCLUDED.postcode,
                city = EXCLUDED.city,
                state = EXCLUDED.state,
                profile_photo = EXCLUDED.profile_photo
            `,
            [
                user.id,
                user.name || "",
                user.email || "",
                user.passwordHash || "",
                user.role || "customer",
                user.createdAt || null,
                user.createdBy || null,
                user.phone || null,
                user.address || null,
                user.postcode || null,
                user.city || null,
                user.state || null,
                user.profilePhoto || null
            ]
        );
    }

    console.log(`✅ Users migrated: ${users.length}`);
}


async function migrateProducts() {

    console.log("\n📦 Migrating products...");

    const products = readJson(productsFile);

    for (const product of products) {

        await client.query(
            `
            INSERT INTO products (
                id,
                name,
                description,
                price,
                stock,
                category,
                image,
                created_at,
                updated_at
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9
            )
            ON CONFLICT (id)
            DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                price = EXCLUDED.price,
                stock = EXCLUDED.stock,
                category = EXCLUDED.category,
                image = EXCLUDED.image,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at
            `,
            [
                product.id,
                product.name || "",
                product.description || null,
                Number(product.price) || 0,
                Number(product.stock) || 0,
                product.category || null,
                product.image || null,
                product.createdAt || null,
                product.updatedAt || null
            ]
        );

        const variants = Array.isArray(product.variants)
            ? product.variants
            : [];

        for (const variant of variants) {

            const attributes =
                variant.attributes || {};

            await client.query(
                `
                INSERT INTO product_variants (
                    id,
                    product_id,
                    name,
                    storage,
                    color,
                    price,
                    stock,
                    attributes
                )
                VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8
                )
                ON CONFLICT (id)
                DO UPDATE SET
                    product_id = EXCLUDED.product_id,
                    name = EXCLUDED.name,
                    storage = EXCLUDED.storage,
                    color = EXCLUDED.color,
                    price = EXCLUDED.price,
                    stock = EXCLUDED.stock,
                    attributes = EXCLUDED.attributes
                `,
                [
                    variant.id,
                    product.id,
                    variant.name || null,
                    variant.storage ||
                        attributes.storage ||
                        null,
                    variant.color ||
                        attributes.color ||
                        null,
                    Number(variant.price) || 0,
                    Number(variant.stock) || 0,
                    JSON.stringify(attributes)
                ]
            );
        }
    }

    const variantCount = products.reduce(
        (total, product) =>
            total +
            (
                Array.isArray(product.variants)
                    ? product.variants.length
                    : 0
            ),
        0
    );

    console.log(`✅ Products migrated: ${products.length}`);
    console.log(`✅ Variants migrated: ${variantCount}`);
}


async function migrateOrders() {

    console.log("\n🛒 Migrating orders...");

    const orders = readJson(ordersFile);

    for (const order of orders) {

        const customer =
            order.customer || {};

        const shipping =
            order.shipping || {};

        await client.query(
            `
            INSERT INTO orders (
                id,
                order_number,
                order_date,
                customer_name,
                customer_email,
                customer_phone,
                shipping_address,
                shipping_city,
                shipping_postcode,
                shipping_state,
                payment_method,
                payment_status,
                status,
                subtotal,
                shipping_fee,
                total,
                paid_at
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17
            )
            ON CONFLICT (id)
            DO UPDATE SET
                order_number = EXCLUDED.order_number,
                order_date = EXCLUDED.order_date,
                customer_name = EXCLUDED.customer_name,
                customer_email = EXCLUDED.customer_email,
                customer_phone = EXCLUDED.customer_phone,
                shipping_address = EXCLUDED.shipping_address,
                shipping_city = EXCLUDED.shipping_city,
                shipping_postcode = EXCLUDED.shipping_postcode,
                shipping_state = EXCLUDED.shipping_state,
                payment_method = EXCLUDED.payment_method,
                payment_status = EXCLUDED.payment_status,
                status = EXCLUDED.status,
                subtotal = EXCLUDED.subtotal,
                shipping_fee = EXCLUDED.shipping_fee,
                total = EXCLUDED.total,
                paid_at = EXCLUDED.paid_at
            `,
            [
                order.id,
                order.orderNumber,
                order.date || null,

                customer.name || null,
                customer.email || null,
                customer.phone || null,

                shipping.address || null,
                shipping.city || null,
                shipping.postcode || null,
                shipping.state || null,

                order.paymentMethod || null,
                order.paymentStatus || null,
                order.status || null,

                Number(order.subtotal) || 0,
                Number(order.shippingFee) || 0,
                Number(order.total) || 0,

                order.paidAt || null
            ]
        );

        await client.query(
            `
            DELETE FROM order_items
            WHERE order_id = $1
            `,
            [order.id]
        );

        const items =
            Array.isArray(order.items)
                ? order.items
                : [];

        for (const item of items) {

            await client.query(
                `
                INSERT INTO order_items (
                    order_id,
                    product_id,
                    variant_id,
                    name,
                    variant_name,
                    attributes,
                    price,
                    quantity,
                    image
                )
                VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9
                )
                `,
                [
                    order.id,
                    item.productId || null,
                    item.variantId || null,
                    item.name || null,
                    item.variantName || null,
                    JSON.stringify(
                        item.attributes || {}
                    ),
                    Number(item.price) || 0,
                    Number(item.quantity) || 1,
                    item.image || null
                ]
            );
        }
    }

    const itemCount = orders.reduce(
        (total, order) =>
            total +
            (
                Array.isArray(order.items)
                    ? order.items.length
                    : 0
            ),
        0
    );

    console.log(`✅ Orders migrated: ${orders.length}`);
    console.log(`✅ Order items migrated: ${itemCount}`);
}


async function migratePostcodes() {

    console.log("\n📍 Migrating Malaysia postcodes...");

    const data = readJson(postcodesFile);

    const entries = Object.entries(data);

    for (const [postcode, info] of entries) {

        await client.query(
            `
            INSERT INTO malaysia_postcodes (
                postcode,
                city,
                state
            )
            VALUES ($1,$2,$3)
            ON CONFLICT (postcode)
            DO UPDATE SET
                city = EXCLUDED.city,
                state = EXCLUDED.state
            `,
            [
                postcode,
                info.city || "",
                info.state || ""
            ]
        );
    }

    console.log(
        `✅ Postcodes migrated: ${entries.length}`
    );
}


async function main() {

    try {

        console.log("========================================");
        console.log("      ZIQTECH JSON → POSTGRESQL");
        console.log("========================================");

        await client.connect();

        console.log("✅ Connected to PostgreSQL");

        await client.query("BEGIN");

        await migrateUsers();
        await migrateProducts();
        await migrateOrders();
        await migratePostcodes();

        await client.query("COMMIT");

        console.log("\n========================================");
        console.log("🎉 MIGRATION COMPLETE");
        console.log("========================================");

    } catch (error) {

        console.error("\n❌ MIGRATION FAILED");
        console.error(error);

        try {
            await client.query("ROLLBACK");
        } catch {}

        process.exitCode = 1;

    } finally {

        await client.end();

    }
}

main();