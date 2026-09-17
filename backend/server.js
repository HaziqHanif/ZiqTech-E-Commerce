require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const session = require("express-session");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const app = express();

const db = new Pool({
    user: "haziqhanif",
    host: "localhost",
    database: "ziqtech",
    port: 5432
});

db.on("error", (error) => {
    console.error("❌ PostgreSQL error:", error.message);
});

/* =========================================================
   CONFIG
========================================================= */

const PORT = Number(process.env.PORT) || 3001;

const backendFolder = __dirname;
const projectFolder = path.join(__dirname, "..");
const frontendFolder = path.join(projectFolder, "frontend");
const databaseFolder = path.join(projectFolder, "database");

/* =========================================================
   PAYMENT CONFIG
========================================================= */

const PAYMENT_MODE = (
    process.env.PAYMENT_MODE || "DEMO"
).toUpperCase();

const BILLPLZ_SECRET_KEY =
    process.env.BILLPLZ_SECRET_KEY || "";

const BILLPLZ_COLLECTION_ID =
    process.env.BILLPLZ_COLLECTION_ID || "";

const BILLPLZ_X_SIGNATURE_KEY =
    process.env.BILLPLZ_X_SIGNATURE_KEY || "";

const BILLPLZ_BASE_URL =
    process.env.BILLPLZ_BASE_URL ||
    "https://www.billplz-sandbox.com/api";

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    `http://localhost:${PORT}`;

const PUBLIC_URL =
    process.env.PUBLIC_URL ||
    FRONTEND_URL;

/* =========================================================
   MIDDLEWARE
========================================================= */

app.set("trust proxy", 1);

app.use(helmet({
    contentSecurityPolicy: false
}));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Terlalu banyak cubaan. Sila cuba lagi selepas 15 minit."
    }
});

app.use([
    "/api/auth/login",
    "/api/auth/register"
], authLimiter);

app.use(cors());

app.use(express.urlencoded({
    extended: true
}));

app.use(express.json({
    limit: "2mb"
}));

app.use(session({
    store: new pgSession({
        pool: db,
        tableName: "user_sessions",
        createTableIfMissing: true
    }),
    secret:
        process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

/* =========================================================
   FILE / FOLDER HELPERS
========================================================= */

function ensureFolder(folderPath) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, {
            recursive: true
        });
    }
}

function ensureFile(filePath, defaultData) {
    ensureFolder(path.dirname(filePath));

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(
            filePath,
            JSON.stringify(defaultData, null, 4),
            "utf8"
        );
    }
}





/* =========================================================
   INITIAL FILES
========================================================= */

ensureFolder(databaseFolder);





/* =========================================================
   PASSWORD AUTHENTICATION
========================================================= */

function hashPassword(password) {
    const salt = crypto
        .randomBytes(16)
        .toString("hex");

    const hash = crypto
        .scryptSync(password, salt, 64)
        .toString("hex");

    return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
    try {
        if (
            typeof storedPassword !== "string"
        ) {
            return false;
        }

        const parts = storedPassword.split(":");

        if (
            parts.length !== 3 ||
            parts[0] !== "scrypt"
        ) {
            return false;
        }

        const salt = parts[1];
        const storedHash = parts[2];

        const hash = crypto
            .scryptSync(password, salt, 64)
            .toString("hex");

        const hashBuffer = Buffer.from(
            hash,
            "hex"
        );

        const storedBuffer = Buffer.from(
            storedHash,
            "hex"
        );

        if (
            hashBuffer.length !==
            storedBuffer.length
        ) {
            return false;
        }

        return crypto.timingSafeEqual(
            hashBuffer,
            storedBuffer
        );
    } catch (error) {
        return false;
    }
}

/* =========================================================
   CREATE DEFAULT ADMIN — POSTGRESQL
========================================================= */

async function createDefaultAdmin() {
    try {
        const email = "admin@ziqtech.com";

        const existingResult =
            await db.query(
                `
                SELECT id
                FROM users
                WHERE LOWER(email) = $1
                LIMIT 1
                `,
                [email]
            );

        if (existingResult.rowCount > 0) {
            console.log("✅ Admin account found.");
            console.log("🔐 Existing admin password preserved.");
            return;
        }

        const adminPassword =
            process.env.ADMIN_PASSWORD;

        await db.query(
            `
            INSERT INTO users (
                id,
                name,
                email,
                password_hash,
                role,
                created_at
            )
            VALUES ($1, $2, $3, $4, 'admin', NOW())
            `,
            [
                `admin-${Date.now()}`,
                "ZiqTech Admin",
                email,
                hashPassword(adminPassword)
            ]
        );

        console.log(
            "✅ Default PostgreSQL admin created."
        );

    } catch (error) {
        console.error(
            "❌ Default admin PostgreSQL error:",
            error
        );
    }
}

// =========================================================
// CREATE ADMIN ACCOUNT — ADMIN ONLY — POSTGRESQL
// =========================================================

function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message:
                "Sila login terlebih dahulu."
        });
    }

    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message:
                "Sila login terlebih dahulu."
        });
    }

    if (
        req.session.user.role !==
        "admin"
    ) {
        return res.status(403).json({
            success: false,
            message:
                "Akses admin diperlukan."
        });
    }

    next();
}

app.post(
    "/api/admin/create-admin",
    requireAdmin,
    async (req, res) => {
        try {
            const {
                name,
                email,
                password
            } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Sila lengkapkan semua maklumat."
                });
            }

            if (String(password).length < 8) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Password admin mestilah sekurang-kurangnya 8 aksara."
                });
            }

            const normalizedEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            const existingResult =
                await db.query(
                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(email) = $1
                    LIMIT 1
                    `,
                    [normalizedEmail]
                );

            if (existingResult.rowCount > 0) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Email ini sudah digunakan."
                });
            }

            const adminId =
                `admin-${Date.now()}`;

            const result =
                await db.query(
                    `
                    INSERT INTO users (
                        id,
                        name,
                        email,
                        password_hash,
                        role,
                        created_at,
                        created_by
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        'admin',
                        NOW(),
                        $5
                    )
                    RETURNING
                        id,
                        name,
                        email,
                        role
                    `,
                    [
                        adminId,
                        String(name).trim(),
                        normalizedEmail,
                        hashPassword(password),
                        req.session.user.email
                    ]
                );

            return res.status(201).json({
                success: true,
                message:
                    "Admin berjaya didaftarkan.",
                user:
                    result.rows[0]
            });

        } catch (error) {
            if (error?.code === "23505") {
                return res.status(409).json({
                    success: false,
                    message:
                        "Email ini sudah digunakan."
                });
            }

            console.error(
                "Create admin PostgreSQL error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mencipta akaun admin."
            });
        }
    }
);

// =========================================================
// LIST ADMINS — ADMIN ONLY — POSTGRESQL
// =========================================================

app.get(
    "/api/admin/list",
    requireAdmin,
    async (req, res) => {
        try {
            const result =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role,
                        created_at,
                        created_by
                    FROM users
                    WHERE role = 'admin'
                    ORDER BY created_at DESC NULLS LAST
                    `
                );

            const admins =
                result.rows.map(admin => ({
                    id: admin.id,
                    name: admin.name || "",
                    email: admin.email || "",
                    role: admin.role,
                    createdAt:
                        admin.created_at || null,
                    createdBy:
                        admin.created_by || null
                }));

            return res.json({
                success: true,
                admins
            });

        } catch (error) {
            console.error(
                "List admins PostgreSQL error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mendapatkan senarai admin."
            });
        }
    }
);

// =========================================================
// DELETE ADMIN — ADMIN ONLY — POSTGRESQL
// =========================================================

app.delete(
    "/api/admin/:id",
    requireAdmin,
    async (req, res) => {
        const adminId =
            String(req.params.id);

        const client =
            await db.connect();

        try {
            await client.query("BEGIN");

            const adminsResult =
                await client.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role
                    FROM users
                    WHERE role = 'admin'
                    FOR UPDATE
                    `
                );

            const targetAdmin =
                adminsResult.rows.find(
                    admin =>
                        String(admin.id) ===
                        adminId
                );

            if (!targetAdmin) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message:
                        "Admin tidak dijumpai."
                });
            }

            if (
                String(targetAdmin.id) ===
                String(req.session.user.id)
            ) {
                await client.query("ROLLBACK");

                return res.status(403).json({
                    success: false,
                    message:
                        "Anda tidak boleh delete akaun admin sendiri."
                });
            }

            if (adminsResult.rows.length <= 1) {
                await client.query("ROLLBACK");

                return res.status(403).json({
                    success: false,
                    message:
                        "Sekurang-kurangnya seorang admin mesti kekal."
                });
            }

            await client.query(
                `
                DELETE FROM users
                WHERE id = $1
                  AND role = 'admin'
                `,
                [adminId]
            );

            await client.query("COMMIT");

            return res.json({
                success: true,
                message:
                    "Admin berjaya dipadam."
            });

        } catch (error) {
            try {
                await client.query("ROLLBACK");
            } catch {}

            console.error(
                "Delete admin PostgreSQL error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal memadam admin."
            });

        } finally {
            client.release();
        }
    }
);

// =========================================================
// LIST ALL USERS — ADMIN ONLY
// =========================================================

app.get(
    "/api/admin/users",
    requireAdmin,
    async (req, res) => {
        try {

            const result =
                await db.query(`
                    SELECT
                        id,
                        name,
                        email,
                        role,
                        phone,
                        address,
                        postcode,
                        city,
                        state,
                        profile_photo,
                        created_at,
                        created_by
                    FROM users
                    ORDER BY created_at DESC NULLS LAST
                `);

            const safeUsers =
                result.rows.map(user => ({
                    id:
                        user.id,

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    role:
                        user.role || "customer",

                    phone:
                        user.phone || "",

                    address:
                        user.address || "",

                    postcode:
                        user.postcode || "",

                    city:
                        user.city || "",

                    state:
                        user.state || "",

                    profilePhoto:
                        user.profile_photo || null,

                    createdAt:
                        user.created_at || null,

                    createdBy:
                        user.created_by || null
                }));

            return res.json({
                success: true,
                users: safeUsers
            });

        } catch (error) {

            console.error(
                "List users PostgreSQL error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mendapatkan senarai users."
            });
        }
    }
);
// =========================================================
// UPDATE USER — ADMIN ONLY
// =========================================================

// =========================================================
// UPDATE USER — ADMIN ONLY — POSTGRESQL
// =========================================================

app.put(
    "/api/admin/users/:id",
    requireAdmin,
    async (req, res) => {
        try {

            const userId =
                String(req.params.id);

            const {
                name,
                email,
                phone,
                address,
                postcode,
                city,
                state,
                role
            } = req.body;

            // =========================
            // VALIDATE NAME
            // =========================

            if (
                !name ||
                !String(name).trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Nama diperlukan."
                });
            }

            // =========================
            // VALIDATE EMAIL
            // =========================

            if (
                !email ||
                !String(email).trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Email diperlukan."
                });
            }

            const normalizedEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            // =========================
            // GET CURRENT USER
            // =========================

            const currentResult =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );

            const currentUser =
                currentResult.rows[0];

            if (!currentUser) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User tidak dijumpai."
                });
            }

            // =========================
            // CHECK DUPLICATE EMAIL
            // =========================

            const duplicateResult =
                await db.query(
                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(email) = $1
                      AND id <> $2
                    LIMIT 1
                    `,
                    [
                        normalizedEmail,
                        userId
                    ]
                );

            if (
                duplicateResult.rows.length > 0
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Email ini sudah digunakan oleh user lain."
                });
            }

            // =========================
            // VALIDATE ROLE
            // =========================

            const newRole =
                role === "admin"
                    ? "admin"
                    : "customer";

            // =========================
            // PREVENT LAST ADMIN
            // =========================

            if (
                currentUser.role === "admin" &&
                newRole !== "admin"
            ) {

                const adminCountResult =
                    await db.query(
                        `
                        SELECT COUNT(*)::int AS count
                        FROM users
                        WHERE role = 'admin'
                        `
                    );

                const adminCount =
                    adminCountResult.rows[0].count;

                if (adminCount <= 1) {
                    return res.status(403).json({
                        success: false,
                        message:
                            "Sekurang-kurangnya seorang admin mesti kekal."
                    });
                }
            }

            // =========================
            // UPDATE POSTGRESQL
            // =========================

            const result =
                await db.query(
                    `
                    UPDATE users
                    SET
                        name = $1,
                        email = $2,
                        phone = $3,
                        address = $4,
                        postcode = $5,
                        city = $6,
                        state = $7,
                        role = $8
                    WHERE id = $9
                    RETURNING
                        id,
                        name,
                        email,
                        role,
                        phone,
                        address,
                        postcode,
                        city,
                        state,
                        profile_photo,
                        created_at,
                        created_by
                    `,
                    [
                        String(name).trim(),
                        normalizedEmail,
                        String(phone || "").trim(),
                        String(address || "").trim(),
                        String(postcode || "").trim(),
                        String(city || "").trim(),
                        String(state || "").trim(),
                        newRole,
                        userId
                    ]
                );

            const user =
                result.rows[0];

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User tidak dijumpai."
                });
            }

            // =========================
            // UPDATE CURRENT SESSION
            // =========================

            if (
                req.session.user &&
                String(req.session.user.id) ===
                    String(user.id)
            ) {

                req.session.user = {
                    id:
                        user.id,

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    role:
                        user.role || "customer",

                    phone:
                        user.phone || "",

                    address:
                        user.address || "",

                    postcode:
                        user.postcode || "",

                    city:
                        user.city || "",

                    state:
                        user.state || "",

                    profilePhoto:
                        user.profile_photo ||
                        null
                };
            }

            // =========================
            // SAFE RESPONSE
            // =========================

            return res.json({
                success: true,
                message:
                    "User berjaya dikemaskini.",
                user: {
                    id:
                        user.id,

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    role:
                        user.role || "customer",

                    phone:
                        user.phone || "",

                    address:
                        user.address || "",

                    postcode:
                        user.postcode || "",

                    city:
                        user.city || "",

                    state:
                        user.state || "",

                    profilePhoto:
                        user.profile_photo ||
                        null,

                    createdAt:
                        user.created_at ||
                        null,

                    createdBy:
                        user.created_by ||
                        null
                }
            });

        } catch (error) {

            console.error(
                "Admin update user PostgreSQL error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mengemaskini user."
            });
        }
    }
);
// =========================================================
// DELETE USER — ADMIN ONLY — POSTGRESQL
// =========================================================

app.delete(
    "/api/admin/users/:id",
    requireAdmin,
    async (req, res) => {
        try {

            const userId =
                String(req.params.id);

            // =========================
            // GET TARGET USER
            // =========================

            const targetResult =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );

            const targetUser =
                targetResult.rows[0];

            if (!targetUser) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User tidak dijumpai."
                });
            }

            // =========================
            // PREVENT SELF DELETE
            // =========================

            if (
                String(targetUser.id) ===
                String(req.session.user.id)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Anda tidak boleh delete akaun sendiri."
                });
            }

            // =========================
            // PREVENT LAST ADMIN DELETE
            // =========================

            if (
                targetUser.role === "admin"
            ) {

                const adminCountResult =
                    await db.query(
                        `
                        SELECT COUNT(*)::int AS count
                        FROM users
                        WHERE role = 'admin'
                        `
                    );

                const adminCount =
                    adminCountResult.rows[0].count;

                if (adminCount <= 1) {
                    return res.status(403).json({
                        success: false,
                        message:
                            "Sekurang-kurangnya seorang admin mesti kekal."
                    });
                }
            }

            // =========================
            // DELETE FROM POSTGRESQL
            // =========================

            const deleteResult =
                await db.query(
                    `
                    DELETE FROM users
                    WHERE id = $1
                    RETURNING
                        id,
                        name,
                        email,
                        role
                    `,
                    [userId]
                );

            if (
                deleteResult.rowCount === 0
            ) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User tidak dijumpai."
                });
            }

            // =========================
            // RESPONSE
            // =========================

            return res.json({
                success: true,
                message:
                    "User berjaya dipadam.",
                user:
                    deleteResult.rows[0]
            });

        } catch (error) {

            console.error(
                "Admin delete user PostgreSQL error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal memadam user."
            });
        }
    }
);
/* LOGIN */

app.post(
    "/api/auth/register",
    async (req, res) => {
        try {
            const {
                name,
                email,
                password
            } = req.body;

            /* VALIDATION */

            if (
                !name ||
                !email ||
                !password
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Sila lengkapkan semua maklumat."
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Password mestilah sekurang-kurangnya 6 aksara."
                });
            }

            const normalizedEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            const normalizedName =
                String(name).trim();

            /* CHECK EXISTING USER IN POSTGRESQL */

            const existingResult =
                await db.query(
                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(email) = $1
                    LIMIT 1
                    `,
                    [normalizedEmail]
                );

            if (existingResult.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Email ini sudah berdaftar."
                });
            }

            /* CREATE USER */

            const userId =
                `user-${Date.now()}`;

            const passwordHash =
                hashPassword(password);

            const createdAt =
                new Date().toISOString();

            const result =
                await db.query(
                    `
                    INSERT INTO users (
                        id,
                        name,
                        email,
                        password_hash,
                        role,
                        created_at
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6
                    )
                    RETURNING
                        id,
                        name,
                        email,
                        role,
                        created_at
                    `,
                    [
                        userId,
                        normalizedName,
                        normalizedEmail,
                        passwordHash,
                        "customer",
                        createdAt
                    ]
                );

            const user =
                result.rows[0];

            return res.status(201).json({
                success: true,
                message:
                    "Akaun berjaya didaftarkan.",
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });

        } catch (error) {
            console.error(
                "Register error:",
                error
            );

            /*
             * PostgreSQL unique email protection.
             * Handles two simultaneous registrations
             * using the same email.
             */
            if (error.code === "23505") {
                return res.status(409).json({
                    success: false,
                    message:
                        "Email ini sudah berdaftar."
                });
            }

            return res.status(500).json({
                success: false,
                message:
                    "Ralat server semasa pendaftaran."
            });
        }
    }
);

// =========================================================
// CREATE ADMIN ACCOUNT — ADMIN ONLY
// =========================================================

app.post("/api/admin/create-admin", requireAdmin, (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Sila lengkapkan semua maklumat."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password admin mestilah sekurang-kurangnya 8 aksara."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const users = readJsonFile(usersFile, []);

        const existingUser = users.find(
            user =>
                String(user.email || "").toLowerCase() ===
                normalizedEmail
        );

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email ini sudah digunakan."
            });
        }

        const admin = {
            id: `admin-${Date.now()}`,
            name: name.trim(),
            email: normalizedEmail,
            passwordHash: hashPassword(password),
            role: "admin",
            createdAt: new Date().toISOString(),
            createdBy: req.session.user.email
        };

        users.push(admin);

        saveJsonFile(usersFile, users);

        return res.status(201).json({
            success: true,
            message: "Admin berjaya didaftarkan.",
            user: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });

    } catch (error) {
        console.error("Create admin error:", error);

        return res.status(500).json({
            success: false,
            message: "Gagal mencipta akaun admin."
        });
    }
});

// =========================================================
// LIST ADMINS — ADMIN ONLY
// =========================================================

app.get("/api/admin/list", requireAdmin, (req, res) => {
    try {
        const users = readJsonFile(usersFile, []);

        const admins = users
            .filter(user => user.role === "admin")
            .map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
                createdBy: user.createdBy || null
            }));

        return res.json({
            success: true,
            admins
        });

    } catch (error) {
        console.error("List admins error:", error);

        return res.status(500).json({
            success: false,
            message: "Gagal mendapatkan senarai admin."
        });
    }
});
// =========================================================
// DELETE ADMIN — ADMIN ONLY
// =========================================================

app.delete("/api/admin/:id", requireAdmin, (req, res) => {
    try {
        const adminId = String(req.params.id);

        const users = readJsonFile(usersFile, []);

        const targetAdmin = users.find(
            user =>
                user.id === adminId &&
                user.role === "admin"
        );

        if (!targetAdmin) {
            return res.status(404).json({
                success: false,
                message: "Admin tidak dijumpai."
            });
        }

        // Prevent deleting yourself
        if (
            targetAdmin.id ===
            req.session.user.id
        ) {
            return res.status(403).json({
                success: false,
                message: "Anda tidak boleh delete akaun admin sendiri."
            });
        }

        const adminCount = users.filter(
            user => user.role === "admin"
        ).length;

        // Always keep at least one admin
        if (adminCount <= 1) {
            return res.status(403).json({
                success: false,
                message: "Sekurang-kurangnya seorang admin mesti kekal."
            });
        }

        const updatedUsers = users.filter(
            user => user.id !== adminId
        );

        saveJsonFile(
            usersFile,
            updatedUsers
        );

        return res.json({
            success: true,
            message: "Admin berjaya dipadam."
        });

    } catch (error) {
        console.error("Delete admin error:", error);

        return res.status(500).json({
            success: false,
            message: "Gagal memadam admin."
        });
    }
});

// =========================================================
// LIST ALL USERS — ADMIN ONLY
// =========================================================

app.get(
    "/api/admin/users",
    requireAdmin,
    async (req, res) => {
        try {

            const result =
                await db.query(`
                    SELECT
                        id,
                        name,
                        email,
                        role,
                        phone,
                        address,
                        postcode,
                        city,
                        state,
                        profile_photo,
                        created_at,
                        created_by
                    FROM users
                    ORDER BY created_at DESC NULLS LAST
                `);

            const safeUsers =
                result.rows.map(user => ({
                    id:
                        user.id,

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    role:
                        user.role || "customer",

                    phone:
                        user.phone || "",

                    address:
                        user.address || "",

                    postcode:
                        user.postcode || "",

                    city:
                        user.city || "",

                    state:
                        user.state || "",

                    profilePhoto:
                        user.profile_photo || null,

                    createdAt:
                        user.created_at || null,

                    createdBy:
                        user.created_by || null
                }));

            return res.json({
                success: true,
                users: safeUsers
            });

        } catch (error) {

            console.error(
                "List users PostgreSQL error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mendapatkan senarai users."
            });
        }
    }
);
// =========================================================
// UPDATE USER — ADMIN ONLY
// =========================================================

// =========================================================
// UPDATE USER — ADMIN ONLY — POSTGRESQL
// =========================================================

app.put(
    "/api/admin/users/:id",
    requireAdmin,
    async (req, res) => {
        try {

            const userId =
                String(req.params.id);

            const {
                name,
                email,
                phone,
                address,
                postcode,
                city,
                state,
                role
            } = req.body;

            // =========================
            // VALIDATE NAME
            // =========================

            if (
                !name ||
                !String(name).trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Nama diperlukan."
                });
            }

            // =========================
            // VALIDATE EMAIL
            // =========================

            if (
                !email ||
                !String(email).trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Email diperlukan."
                });
            }

            const normalizedEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            // =========================
            // GET CURRENT USER
            // =========================

            const currentResult =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );

            const currentUser =
                currentResult.rows[0];

            if (!currentUser) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User tidak dijumpai."
                });
            }

            // =========================
            // CHECK DUPLICATE EMAIL
            // =========================

            const duplicateResult =
                await db.query(
                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(email) = $1
                      AND id <> $2
                    LIMIT 1
                    `,
                    [
                        normalizedEmail,
                        userId
                    ]
                );

            if (
                duplicateResult.rows.length > 0
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Email ini sudah digunakan oleh user lain."
                });
            }

            // =========================
            // VALIDATE ROLE
            // =========================

            const newRole =
                role === "admin"
                    ? "admin"
                    : "customer";

            // =========================
            // PREVENT LAST ADMIN
            // =========================

            if (
                currentUser.role === "admin" &&
                newRole !== "admin"
            ) {

                const adminCountResult =
                    await db.query(
                        `
                        SELECT COUNT(*)::int AS count
                        FROM users
                        WHERE role = 'admin'
                        `
                    );

                const adminCount =
                    adminCountResult.rows[0].count;

                if (adminCount <= 1) {
                    return res.status(403).json({
                        success: false,
                        message:
                            "Sekurang-kurangnya seorang admin mesti kekal."
                    });
                }
            }

            // =========================
            // UPDATE POSTGRESQL
            // =========================

            const result =
                await db.query(
                    `
                    UPDATE users
                    SET
                        name = $1,
                        email = $2,
                        phone = $3,
                        address = $4,
                        postcode = $5,
                        city = $6,
                        state = $7,
                        role = $8
                    WHERE id = $9
                    RETURNING
                        id,
                        name,
                        email,
                        role,
                        phone,
                        address,
                        postcode,
                        city,
                        state,
                        profile_photo,
                        created_at,
                        created_by
                    `,
                    [
                        String(name).trim(),
                        normalizedEmail,
                        String(phone || "").trim(),
                        String(address || "").trim(),
                        String(postcode || "").trim(),
                        String(city || "").trim(),
                        String(state || "").trim(),
                        newRole,
                        userId
                    ]
                );

            const user =
                result.rows[0];

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User tidak dijumpai."
                });
            }

            // =========================
            // UPDATE CURRENT SESSION
            // =========================

            if (
                req.session.user &&
                String(req.session.user.id) ===
                    String(user.id)
            ) {

                req.session.user = {
                    id:
                        user.id,

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    role:
                        user.role || "customer",

                    phone:
                        user.phone || "",

                    address:
                        user.address || "",

                    postcode:
                        user.postcode || "",

                    city:
                        user.city || "",

                    state:
                        user.state || "",

                    profilePhoto:
                        user.profile_photo ||
                        null
                };
            }

            // =========================
            // SAFE RESPONSE
            // =========================

            return res.json({
                success: true,
                message:
                    "User berjaya dikemaskini.",
                user: {
                    id:
                        user.id,

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    role:
                        user.role || "customer",

                    phone:
                        user.phone || "",

                    address:
                        user.address || "",

                    postcode:
                        user.postcode || "",

                    city:
                        user.city || "",

                    state:
                        user.state || "",

                    profilePhoto:
                        user.profile_photo ||
                        null,

                    createdAt:
                        user.created_at ||
                        null,

                    createdBy:
                        user.created_by ||
                        null
                }
            });

        } catch (error) {

            console.error(
                "Admin update user PostgreSQL error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mengemaskini user."
            });
        }
    }
);
// =========================================================
// DELETE USER — ADMIN ONLY — POSTGRESQL
// =========================================================

app.delete(
    "/api/admin/users/:id",
    requireAdmin,
    async (req, res) => {
        try {

            const userId =
                String(req.params.id);

            // =========================
            // GET TARGET USER
            // =========================

            const targetResult =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );

            const targetUser =
                targetResult.rows[0];

            if (!targetUser) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User tidak dijumpai."
                });
            }

            // =========================
            // PREVENT SELF DELETE
            // =========================

            if (
                String(targetUser.id) ===
                String(req.session.user.id)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Anda tidak boleh delete akaun sendiri."
                });
            }

            // =========================
            // PREVENT LAST ADMIN DELETE
            // =========================

            if (
                targetUser.role === "admin"
            ) {

                const adminCountResult =
                    await db.query(
                        `
                        SELECT COUNT(*)::int AS count
                        FROM users
                        WHERE role = 'admin'
                        `
                    );

                const adminCount =
                    adminCountResult.rows[0].count;

                if (adminCount <= 1) {
                    return res.status(403).json({
                        success: false,
                        message:
                            "Sekurang-kurangnya seorang admin mesti kekal."
                    });
                }
            }

            // =========================
            // DELETE FROM POSTGRESQL
            // =========================

            const deleteResult =
                await db.query(
                    `
                    DELETE FROM users
                    WHERE id = $1
                    RETURNING
                        id,
                        name,
                        email,
                        role
                    `,
                    [userId]
                );

            if (
                deleteResult.rowCount === 0
            ) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User tidak dijumpai."
                });
            }

            // =========================
            // RESPONSE
            // =========================

            return res.json({
                success: true,
                message:
                    "User berjaya dipadam.",
                user:
                    deleteResult.rows[0]
            });

        } catch (error) {

            console.error(
                "Admin delete user PostgreSQL error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal memadam user."
            });
        }
    }
);
/* LOGIN */

app.post(
    "/api/auth/login",
    async (req, res) => {
        try {
            const {
                email,
                password
            } = req.body;

            /* =========================
               VALIDATE INPUT
            ========================= */

            if (
                !email ||
                !password
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Email dan password diperlukan."
                });
            }

            const normalizedEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            /* =========================
               GET USER FROM POSTGRESQL
            ========================= */

            const result =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        password_hash,
                        role,
                        phone,
                        address,
                        postcode,
                        city,
                        state,
                        profile_photo
                    FROM users
                    WHERE LOWER(email) = $1
                    LIMIT 1
                    `,
                    [normalizedEmail]
                );

           const user =
    result.rows[0];

            /* =========================
               VERIFY PASSWORD
            ========================= */

            if (
                !user ||
                !verifyPassword(
                    password,
                    user.password_hash
                )
            ) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Email atau password salah."
                });
            }

            /* =========================
               CREATE SESSION
            ========================= */

            req.session.user = {
                id:
                    user.id,
                name:
                    user.name,
                email:
                    user.email,
                role:
                    user.role,
                phone:
                    user.phone || "",
                address:
                    user.address || "",
                postcode:
                    user.postcode || "",
                city:
                    user.city || "",
                state:
                    user.state || "",
                profilePhoto:
                    user.profile_photo || null
            };

            /* =========================
               FORCE SAVE SESSION
            ========================= */

            req.session.save(
                error => {
                    if (error) {
                        console.error(
                            "❌ SESSION SAVE ERROR:",
                            error
                        );

                        return res.status(500).json({
                            success: false,
                            message:
                                "Gagal menyimpan session."
                        });
                    }

                    console.log(
                        "✅ SESSION SAVED:",
                        req.sessionID
                    );

                    console.log(
                        "👤 SESSION USER:",
                        req.session.user
                    );

                    return res.json({
                        success: true,
                        message:
                            "Login berjaya.",
                        user:
                            req.session.user
                    });
                }
            );

        } catch (error) {
            console.error(
                "Login error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Ralat server."
            });
        }
    }
);

/* =========================================================
   CUSTOMER PROFILE
========================================================= */

app.put(
    "/api/auth/profile",
    async (req, res) => {
        try {

            /* REQUIRE LOGIN */

            if (
                !req.session.user ||
                !req.session.user.id
            ) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Sila login terlebih dahulu."
                });
            }


            const userId =
                String(
                    req.session.user.id
                );


            /* DATA FROM PROFILE */

            const {
                name,
                phone,
                address,
                postcode,
                city,
                state,
                profilePhoto
            } = req.body;


            /* VALIDATE NAME */

            if (
                !name ||
                !String(name).trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Nama diperlukan."
                });
            }


            /* UPDATE POSTGRESQL */

            const result =
                await db.query(
                    `
                    UPDATE users
                    SET
                        name = $1,
                        phone = $2,
                        address = $3,
                        postcode = $4,
                        city = $5,
                        state = $6,
                        profile_photo =
                            CASE
                                WHEN $7::text IS NULL
                                THEN profile_photo
                                ELSE $7
                            END
                    WHERE id = $8
                    RETURNING
                        id,
                        name,
                        email,
                        role,
                        phone,
                        address,
                        postcode,
                        city,
                        state,
                        profile_photo
                    `,
                    [
                        String(name).trim(),
                        String(phone || "").trim(),
                        String(address || "").trim(),
                        String(postcode || "").trim(),
                        String(city || "").trim(),
                        String(state || "").trim(),
                        profilePhoto !== undefined
                            ? profilePhoto || null
                            : null,
                        userId
                    ]
                );


            const user =
                result.rows[0];


            /* USER NOT FOUND */

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Customer tidak dijumpai."
                });
            }


            /* UPDATE SESSION */

            req.session.user = {

                id:
                    user.id,

                name:
                    user.name || "",

                email:
                    user.email || "",

                role:
                    user.role || "customer",

                phone:
                    user.phone || "",

                address:
                    user.address || "",

                postcode:
                    user.postcode || "",

                city:
                    user.city || "",

                state:
                    user.state || "",

                profilePhoto:
                    user.profile_photo || null

            };


            /* FORCE SAVE SESSION */

            req.session.save(
                error => {

                    if (error) {

                        console.error(
                            "Profile session save error:",
                            error
                        );

                        return res.status(500).json({
                            success: false,
                            message:
                                "Gagal menyimpan session."
                        });
                    }


                    /* RESPONSE */

                    return res.json({

                        success: true,

                        message:
                            "Profile berjaya dikemaskini.",

                        user:
                            req.session.user

                    });

                }
            );

        } catch (error) {

            console.error(
                "Profile update error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Ralat server semasa mengemaskini profile."

            });

        }
    }
);


/* CURRENT USER */

app.get(
    "/api/auth/me",
    async (req, res) => {
        try {
            console.log(
                "AUTH SESSION ID:",
                req.sessionID
            );

            console.log(
                "AUTH SESSION USER:",
                req.session.user
            );

            if (
                !req.session.user ||
                !req.session.user.id
            ) {
                return res.json({
                    success: true,
                    loggedIn: false,
                    user: null
                });
            }

            const userId =
                String(req.session.user.id);

            /* GET CURRENT USER FROM POSTGRESQL */

            const result =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role,
                        phone,
                        address,
                        postcode,
                        city,
                        state,
                        profile_photo
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );

            const user =
                result.rows[0];

            if (!user) {
                return res.json({
                    success: true,
                    loggedIn: false,
                    user: null
                });
            }

            const safeUser = {
                id:
                    user.id,
                name:
                    user.name || "",
                email:
                    user.email || "",
                role:
                    user.role || "customer",
                phone:
                    user.phone || "",
                address:
                    user.address || "",
                postcode:
                    user.postcode || "",
                city:
                    user.city || "",
                state:
                    user.state || "",
                profilePhoto:
                    user.profile_photo || null
            };

            /*
             * Refresh session using PostgreSQL
             * as the source of truth.
             */
            req.session.user =
                safeUser;

            return res.json({
                success: true,
                loggedIn: true,
                user:
                    safeUser
            });

        } catch (error) {
            console.error(
                "Auth me error:",
                error
            );

            return res.status(500).json({
                success: false,
                loggedIn: false,
                user: null,
                message:
                    "Ralat server semasa mendapatkan user."
            });
        }
    }
);
/* LOGOUT */

app.post(
    "/api/auth/logout",
    (req, res) => {
        req.session.destroy(
            error => {
                if (error) {
                    console.error(
                        "Logout error:",
                        error
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Gagal logout."
                    });
                }

                res.clearCookie(
                    "connect.sid"
                );

                return res.json({
                    success: true,
                    message:
                        "Logout berjaya."
                });
            }
        );
    }
);

/* =========================================================
   PRODUCT HELPERS
========================================================= */





function findProduct(products, productId) {
    return products.find(
        product =>
            String(product.id) ===
            String(productId)
    );
}
async function readProductsFromDB() {

    const productsResult = await db.query(`
        SELECT
            id,
            name,
            description,
            price,
            stock,
            category,
            image,
            created_at,
            updated_at
        FROM products
        ORDER BY id ASC
    `);

    const variantsResult = await db.query(`
        SELECT
            id,
            product_id,
            name,
            storage,
            color,
            price,
            stock,
            attributes
        FROM product_variants
        ORDER BY product_id ASC, id ASC
    `);

    const variantsByProduct = {};

    for (const variant of variantsResult.rows) {

        if (!variantsByProduct[variant.product_id]) {
            variantsByProduct[variant.product_id] = [];
        }

        variantsByProduct[variant.product_id].push({
            id: variant.id,
            name: variant.name || "",
            storage: variant.storage || "",
            color: variant.color || "",
            price: Number(variant.price) || 0,
            stock: Number(variant.stock) || 0,
            attributes: variant.attributes || {}
        });
    }

    return productsResult.rows.map(product => ({

        id: product.id,

        name: product.name,

        description:
            product.description || "",

        price:
            Number(product.price) || 0,

        stock:
            Number(product.stock) || 0,

        category:
            product.category || "",

        image:
            product.image || "",

        createdAt:
            product.created_at,

        updatedAt:
            product.updated_at,

        variants:
            variantsByProduct[product.id] || []

    }));
}

function findVariant(
    product,
    variantId
) {
    if (
        !product ||
        !Array.isArray(product.variants)
    ) {
        return null;
    }

    return product.variants.find(
        variant =>
            String(variant.id) ===
            String(variantId)
    );
}
function getVariantAttributes(variant = {}) {
    if (
        variant &&
        variant.attributes &&
        typeof variant.attributes === "object" &&
        !Array.isArray(variant.attributes)
    ) {
        return { ...variant.attributes };
    }

    const attributes = {};

    const fields = [
        "chip",
        "ram",
        "storage",
        "color",
        "colour",
        "size",
        "type"
    ];

    for (const field of fields) {
        if (
            variant[field] !== undefined &&
            variant[field] !== null &&
            String(variant[field]).trim() !== ""
        ) {
            const key =
                field === "colour"
                    ? "color"
                    : field;

            if (!attributes[key]) {
                attributes[key] =
                    String(variant[field]).trim();
            }
        }
    }

    return attributes;
}

function getVariantDisplayName(variant = {}) {
    if (
        variant.name &&
        String(variant.name).trim()
    ) {
        return String(variant.name).trim();
    }

    if (
        variant.label &&
        String(variant.label).trim()
    ) {
        return String(variant.label).trim();
    }

    const attributes =
        getVariantAttributes(variant);

    return Object.entries(attributes)
        .filter(
            ([key, value]) =>
                value !== undefined &&
                value !== null &&
                String(value).trim() !== ""
        )
        .map(
            ([key, value]) =>
                String(value).trim()
        )
        .join(" • ");
}

function normalizeVariant(variant = {}) {
    const attributes =
        getVariantAttributes(variant);

    return {
        ...variant,

        attributes,

        name:
            variant.name ||
            getVariantDisplayName({
                ...variant,
                attributes
            })
    };
}

function recalculateProductStock(
    product
) {
    if (
        !product ||
        !Array.isArray(product.variants)
    ) {
        return;
    }

    product.stock =
        product.variants.reduce(
            (total, variant) =>
                total +
                (
                    Number(
                        variant.stock
                    ) || 0
                ),
            0
        );
}

/* =========================================================
   ORDER HELPERS
========================================================= */





function createOrderNumber() {
    const now = new Date();

    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            now.getDate()
        ).padStart(2, "0");

    const random =
        Math.floor(
            1000 +
            Math.random() * 9000
        );

    return `ZT-${year}${month}${day}-${random}`;
}

/* =========================================================
   PRICE HELPERS
========================================================= */

function calculateSubtotal(items) {
    if (!Array.isArray(items)) {
        return 0;
    }

    return items.reduce(
        (total, item) => {
            const price =
                Number(
                    item.price
                ) || 0;

            const quantity =
                Number(
                    item.quantity
                ) || 0;

            return (
                total +
                price * quantity
            );
        },
        0
    );
}

function toBillplzAmount(amount) {
    return Math.round(
        Number(amount || 0) * 100
    );
}

/* =========================================================
   CART / ORDER ITEM HELPERS
========================================================= */

function combineItems(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    const combined = {};

    for (const item of items) {
        const productId =
            String(
                item.productId ??
                item.id ??
                ""
            );

        const variantId =
            String(
                item.variantId ??
                ""
            );

        const key =
            `${productId}::${variantId}`;

        if (!combined[key]) {
            combined[key] = {
                ...item,
                productId,
                variantId,
                quantity:
                    Number(
                        item.quantity
                    ) || 0
            };
        } else {
            combined[key].quantity +=
                Number(
                    item.quantity
                ) || 0;
        }
    }

    return Object.values(
        combined
    );
}

function prepareOrderItems(
    items,
    products
) {
    const combined =
        combineItems(items);

    const prepared = [];

    for (const item of combined) {

        const product =
            findProduct(
                products,
                item.productId
            );

        if (!product) {
            throw new Error(
                `Produk tidak dijumpai: ${item.productId}`
            );
        }

        const variant =
            item.variantId
                ? findVariant(
                      product,
                      item.variantId
                  )
                : null;
                if (item.variantId && !variant) {
    console.error(
        "❌ VARIANT TAK JUMPA:",
        item.variantId,
        "Product:",
        product.id,
        "Available variants:",
        product.variants?.map(v => v.id)
    );

    throw new Error(
        `Variant tidak dijumpai: ${item.variantId}`
    );
}

        const quantity =
            Number(
                item.quantity
            ) || 0;

        if (quantity <= 0) {
            throw new Error(
                "Kuantiti produk tidak sah."
            );
        }

        /* =====================================================
           VARIANT ATTRIBUTES
        ===================================================== */

        let attributes = {};

        if (
            variant &&
            variant.attributes &&
            typeof variant.attributes === "object" &&
            !Array.isArray(variant.attributes)
        ) {
            attributes = {
                ...variant.attributes
            };
        }

        /*
         * Legacy database support
         */

        if (
            !attributes.storage &&
            variant?.storage
        ) {
            attributes.storage =
                variant.storage;
        }

        if (
            !attributes.color &&
            variant?.color
        ) {
            attributes.color =
                variant.color;
        }

        if (
            !attributes.color &&
            variant?.colour
        ) {
            attributes.color =
                variant.colour;
        }

        /* =====================================================
           VARIANT NAME
        ===================================================== */

       /* =====================================================
   VARIANT NAME
===================================================== */

let variantName = "";

if (variant) {

    // 1. Explicit name
    if (
        variant.name &&
        String(variant.name).trim()
    ) {
        variantName =
            String(variant.name).trim();
    }

    // 2. Attributes
    if (!variantName) {

        variantName =
            Object.values(attributes)
                .filter(value =>
                    value !== undefined &&
                    value !== null &&
                    String(value).trim() !== ""
                )
                .map(value =>
                    String(value).trim()
                )
                .join(" • ");
    }

    // 3. Legacy fields
    if (!variantName) {

        const parts = [
            variant.chip,
            variant.ram,
            variant.storage,
            variant.color || variant.colour,
            variant.size,
            variant.type
        ];

        variantName =
            parts
                .filter(value =>
                    value !== undefined &&
                    value !== null &&
                    String(value).trim() !== ""
                )
                .map(value =>
                    String(value).trim()
                )
                .join(" • ");
    }

    // 4. FINAL FALLBACK:
    // derive from variant ID
    if (!variantName && variant.id) {

        const id =
            String(variant.id);

        const match =
            id.match(
                /(\d+)gb|(\d+)-1tb|(\d+)-512|silver|spaceblack/i
            );

        if (match) {
            variantName = id
                .replace(
                    /^[^-]+-/,
                    ""
                )
                .replace(
                    /-/g,
                    " "
                );
        }
    }
}
/* =====================================================
   PRICE — SERVER / DATABASE ONLY
===================================================== */

const price =
    variant
        ? Number(variant.price)
        : Number(product.price);

        console.log("🔐 SECURE PRICE CHECK:", {
    clientPrice: item.price,
    databasePrice: price,
    productId: product.id,
    variantId: variant?.id || null
});

if (
    !Number.isFinite(price) ||
    price < 0
) {
    throw new Error(
        `Harga produk tidak sah: ${product.name}`
    );
}

        /* =====================================================
           STOCK
        ===================================================== */

        const availableStock =
            variant
                ? Number(
                      variant.stock
                  ) || 0
                : Number(
                      product.stock
                  ) || 0;

        if (
            quantity >
            availableStock
        ) {
            throw new Error(
                `Stok tidak mencukupi untuk ${product.name}.`
            );
        }

        console.log(
    "🔎 VARIANT DEBUG:",
    JSON.stringify({
        itemVariantId: item.variantId,
        foundVariant: variant,
        attributes: attributes,
        variantName: variantName
    }, null, 2)
);
        /* =====================================================
           SAVE ORDER ITEM
        ===================================================== */

        prepared.push({

            productId:
                product.id,

            variantId:
                variant
                    ? variant.id
                    : null,

            name:
                product.name,

            variantName:
                variantName,

            attributes:
                attributes,

            price:
                price,

            quantity:
                quantity,

            image:
                variant?.image ||
                product.image ||
                ""
        });
    }

    return prepared;
}

function deductStock(
    items,
    products
) {
    for (const item of items) {
        const product =
            findProduct(
                products,
                item.productId
            );

        if (!product) {
            continue;
        }

        const quantity =
            Number(
                item.quantity
            ) || 0;

        if (item.variantId) {
            const variant =
                findVariant(
                    product,
                    item.variantId
                );

            if (variant) {
                variant.stock =
                    Math.max(
                        0,
                        (
                            Number(
                                variant.stock
                            ) || 0
                        ) - quantity
                    );
            }

            recalculateProductStock(
                product
            );
        } else {
            product.stock =
                Math.max(
                    0,
                    (
                        Number(
                            product.stock
                        ) || 0
                    ) - quantity
                );
        }
    }
}
async function deductStockFromDB(
    items,
    client = db
) {
console.log(
    "🔥 POSTGRES STOCK DEDUCTION HIT:",
    JSON.stringify(items, null, 2)
);

    for (const item of items) {

        const productId =
            Number(item.productId);

        const quantity =
            Number(item.quantity) || 0;

        if (
            !Number.isInteger(productId) ||
            quantity <= 0
        ) {
            throw new Error(
                "Product atau quantity tidak sah."
            );
        }

        /* =========================
           VARIANT PRODUCT
        ========================= */

        if (item.variantId) {

            const variantResult =
                await client.query(
                    `
                    UPDATE product_variants
                    SET stock = stock - $1
                    WHERE id = $2
                      AND product_id = $3
                      AND stock >= $1
                    RETURNING id, stock
                    `,
                    [
                        quantity,
                        String(item.variantId),
                        productId
                    ]
                );

            if (
                variantResult.rows.length === 0
            ) {
                throw new Error(
                    `Stok variant tidak mencukupi untuk ${item.name}.`
                );
            }

            /*
             * Recalculate total product stock
             * from all variants.
             */
            await client.query(
                `
                UPDATE products
                SET
                    stock = (
                        SELECT COALESCE(
                            SUM(stock),
                            0
                        )
                        FROM product_variants
                        WHERE product_id = $1
                    ),
                    updated_at = NOW()
                WHERE id = $1
                `,
                [productId]
            );

        } else {

            /* =========================
               NORMAL PRODUCT
            ========================= */

            const productResult =
                await client.query(
                    `
                    UPDATE products
                    SET
                        stock = stock - $1,
                        updated_at = NOW()
                    WHERE id = $2
                      AND stock >= $1
                    RETURNING id, stock
                    `,
                    [
                        quantity,
                        productId
                    ]
                );

            if (
                productResult.rows.length === 0
            ) {
                throw new Error(
                    `Stok tidak mencukupi untuk ${item.name}.`
                );
            }
        }
    }
}

async function saveOrderToDB(
    order,
    client = db
) {

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
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17
        )
        `,
        [
            String(order.id),
            String(order.orderNumber),

           order.orderDate ||
order.date ||
order.createdAt ||
new Date().toISOString(),

            order.customer?.name || "",
            order.customer?.email || "",
            order.customer?.phone || "",

            order.shipping?.address || "",
            order.shipping?.city || "",
            order.shipping?.postcode || "",
            order.shipping?.state || "",

            order.paymentMethod || "",
            order.paymentStatus || "pending",
            order.status || "pending",

            Number(order.subtotal) || 0,
            Number(order.shippingFee) || 0,
            Number(order.total) || 0,

            order.paidAt || null
        ]
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
                $1, $2, $3, $4, $5,
                $6::jsonb, $7, $8, $9
            )
            `,
            [
                String(order.id),

                Number.isInteger(
                    Number(item.productId)
                )
                    ? Number(item.productId)
                    : null,

                item.variantId
                    ? String(item.variantId)
                    : null,

                item.name || "",

                item.variantName || "",

                JSON.stringify(
                    item.attributes &&
                    typeof item.attributes === "object"
                        ? item.attributes
                        : {}
                ),

                Number(item.price) || 0,
                Number(item.quantity) || 1,

                item.image || ""
            ]
        );
    }

    return order;
}
/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/api/health",
    (req, res) => {
        res.json({
            success: true,
            message:
                "ZiqTech API is running.",
            port: PORT,
            paymentMode:
                PAYMENT_MODE,
            time:
                new Date().toISOString()
        });
    }
);

/* =========================================================
   PRODUCT API
========================================================= */
/* GET ALL PRODUCTS */

app.get(
    "/api/products",
    async (req, res) => {
        try {

            const products =
                await readProductsFromDB();

            res.json({
                success: true,
                products
            });

        } catch (error) {

            console.error(
                "Get products PostgreSQL error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Gagal mendapatkan produk."
            });
        }
    }
);


/* GET ONE PRODUCT */

app.get(
    "/api/products/:id",
    async (req, res) => {
        try {

            const products =
                await readProductsFromDB();

            const product =
                findProduct(
                    products,
                    req.params.id
                );

            if (!product) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Produk tidak dijumpai."
                });
            }

            res.json({
                success: true,
                product
            });

        } catch (error) {

            console.error(
                "Get product PostgreSQL error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Gagal mendapatkan produk."
            });
        }
    }
);

/* CREATE PRODUCT - ADMIN ONLY */

/* CREATE PRODUCT - ADMIN ONLY */

app.post(
    "/api/products",
    requireAdmin,
    async (req, res) => {

        const client =
            await db.connect();

        try {

            await client.query("BEGIN");

            const product = {
                ...req.body
            };

            if (!product.name) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Nama produk diperlukan."
                });
            }

            /* =========================
               NORMALIZE VARIANTS
            ========================= */

            if (
                Array.isArray(
                    product.variants
                )
            ) {

                product.variants =
                    product.variants.map(
                        variant => {

                            const attributes =
                                getVariantAttributes(
                                    variant
                                );

                            return {
                                ...variant,

                                attributes,

                                name:
                                    variant.name ||
                                    getVariantDisplayName({
                                        ...variant,
                                        attributes
                                    }),

                                price:
                                    Number(
                                        variant.price
                                    ) || 0,

                                stock:
                                    Number(
                                        variant.stock
                                    ) || 0
                            };
                        }
                    );

                recalculateProductStock(
                    product
                );

            } else {

                product.variants = [];

                product.stock =
                    Number(
                        product.stock
                    ) || 0;
            }

            /* =========================
               GENERATE PRODUCT ID
            ========================= */

            const idResult =
                await client.query(`
                    SELECT
                        COALESCE(
                            MAX(id),
                            0
                        ) + 1 AS next_id
                    FROM products
                `);

            product.id =
                Number(
                    idResult.rows[0].next_id
                );

            /* =========================
               INSERT PRODUCT
            ========================= */

            const productResult =
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
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7,
                        NOW(),
                        NOW()
                    )
                    RETURNING *
                    `,
                    [
                        product.id,
                        product.name,
                        product.description || "",
                        Number(product.price) || 0,
                        Number(product.stock) || 0,
                        product.category || "",
                        product.image || ""
                    ]
                );

            /* =========================
               INSERT VARIANTS
            ========================= */

            const savedVariants = [];

            for (
                let index = 0;
                index < product.variants.length;
                index++
            ) {

                const variant =
                    product.variants[index];

                const variantId =
                    variant.id ||
                    `variant-${Date.now()}-${index}-${crypto
                        .randomBytes(3)
                        .toString("hex")}`;

                const attributes =
                    variant.attributes || {};

                const storage =
                    variant.storage ||
                    attributes.storage ||
                    "";

                const color =
                    variant.color ||
                    attributes.color ||
                    "";

                const variantResult =
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
                            $1,
                            $2,
                            $3,
                            $4,
                            $5,
                            $6,
                            $7,
                            $8::jsonb
                        )
                        RETURNING *
                        `,
                        [
                            variantId,
                            product.id,
                            variant.name || "",
                            storage,
                            color,
                            Number(
                                variant.price
                            ) || 0,
                            Number(
                                variant.stock
                            ) || 0,
                            JSON.stringify(
                                attributes
                            )
                        ]
                    );

                const saved =
                    variantResult.rows[0];

                savedVariants.push({
                    id: saved.id,

                    name:
                        saved.name || "",

                    storage:
                        saved.storage || "",

                    color:
                        saved.color || "",

                    price:
                        Number(
                            saved.price
                        ) || 0,

                    stock:
                        Number(
                            saved.stock
                        ) || 0,

                    attributes:
                        saved.attributes || {}
                });
            }

            await client.query(
                "COMMIT"
            );

            const savedProduct =
                productResult.rows[0];

            const responseProduct = {

                id:
                    savedProduct.id,

                name:
                    savedProduct.name,

                description:
                    savedProduct.description || "",

                price:
                    Number(
                        savedProduct.price
                    ) || 0,

                stock:
                    Number(
                        savedProduct.stock
                    ) || 0,

                category:
                    savedProduct.category || "",

                image:
                    savedProduct.image || "",

                createdAt:
                    savedProduct.created_at,

                updatedAt:
                    savedProduct.updated_at,

                variants:
                    savedVariants
            };

            res.status(201).json({
                success: true,
                message:
                    "Produk berjaya ditambah.",
                product:
                    responseProduct
            });

        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (
                rollbackError
            ) {
                console.error(
                    "Rollback product error:",
                    rollbackError
                );
            }

            console.error(
                "Create product PostgreSQL error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Gagal menambah produk."
            });

        } finally {

            client.release();
        }
    }
);
/* UPDATE PRODUCT - ADMIN ONLY */

app.put(
    "/api/products/:id",
    requireAdmin,
    async (req, res) => {

        const client =
            await db.connect();

        try {

            await client.query("BEGIN");

            const productId =
                Number(req.params.id);

            if (
                !Number.isInteger(productId)
            ) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Product ID tidak sah."
                });
            }

            /* =========================
               GET EXISTING PRODUCT
            ========================= */

            const existingResult =
                await client.query(
                    `
                    SELECT *
                    FROM products
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [productId]
                );

            if (
                existingResult.rows.length === 0
            ) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message:
                        "Produk tidak dijumpai."
                });
            }

            const existingProduct =
                existingResult.rows[0];

            const product = {
                ...req.body
            };

            if (!product.name) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Nama produk diperlukan."
                });
            }

            /* =========================
               NORMALIZE VARIANTS
            ========================= */

            let variants = [];

            if (
                Array.isArray(
                    product.variants
                )
            ) {

                variants =
                    product.variants.map(
                        variant => {

                            const attributes =
                                getVariantAttributes(
                                    variant
                                );

                            return {

                                ...variant,

                                attributes,

                                name:
                                    variant.name ||
                                    getVariantDisplayName({
                                        ...variant,
                                        attributes
                                    }),

                                price:
                                    Number(
                                        variant.price
                                    ) || 0,

                                stock:
                                    Number(
                                        variant.stock
                                    ) || 0
                            };
                        }
                    );
            }

            /* =========================
               CALCULATE PRODUCT STOCK
            ========================= */

            let productStock;

            if (variants.length > 0) {

                productStock =
                    variants.reduce(
                        (
                            total,
                            variant
                        ) =>
                            total +
                            (
                                Number(
                                    variant.stock
                                ) || 0
                            ),
                        0
                    );

            } else {

                productStock =
                    Number(
                        product.stock
                    ) || 0;
            }

            /* =========================
               CALCULATE BASE PRICE
            ========================= */

            let productPrice =
                Number(
                    product.price
                );

            if (
                variants.length > 0
            ) {

                const variantPrices =
                    variants
                        .map(
                            variant =>
                                Number(
                                    variant.price
                                )
                        )
                        .filter(
                            price =>
                                Number.isFinite(
                                    price
                                )
                        );

                if (
                    variantPrices.length > 0
                ) {

                    productPrice =
                        Math.min(
                            ...variantPrices
                        );
                }
            }

            if (
                !Number.isFinite(
                    productPrice
                )
            ) {

                productPrice =
                    Number(
                        existingProduct.price
                    ) || 0;
            }

            /* =========================
               UPDATE PRODUCT
            ========================= */

            const updateResult =
                await client.query(
                    `
                    UPDATE products
                    SET
                        name = $1,
                        description = $2,
                        price = $3,
                        stock = $4,
                        category = $5,
                        image = $6,
                        updated_at = NOW()
                    WHERE id = $7
                    RETURNING *
                    `,
                    [
                        product.name,

                        product.description ??
                            existingProduct.description ??
                            "",

                        productPrice,

                        productStock,

                        product.category ??
                            existingProduct.category ??
                            "",

                        product.image ??
                            existingProduct.image ??
                            "",

                        productId
                    ]
                );

            /* =========================
               REPLACE VARIANTS
            ========================= */

            await client.query(
                `
                DELETE FROM product_variants
                WHERE product_id = $1
                `,
                [productId]
            );

            const savedVariants = [];

            for (
                let index = 0;
                index < variants.length;
                index++
            ) {

                const variant =
                    variants[index];

                const attributes =
                    variant.attributes || {};

                const storage =
                    variant.storage ||
                    attributes.storage ||
                    "";

                const color =
                    variant.color ||
                    attributes.color ||
                    "";

                const variantId =
                    variant.id ||
                    `variant-${Date.now()}-${index}-${crypto
                        .randomBytes(3)
                        .toString("hex")}`;

                const variantResult =
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
                            $1,
                            $2,
                            $3,
                            $4,
                            $5,
                            $6,
                            $7,
                            $8::jsonb
                        )
                        RETURNING *
                        `,
                        [
                            variantId,
                            productId,
                            variant.name || "",
                            storage,
                            color,
                            Number(
                                variant.price
                            ) || 0,
                            Number(
                                variant.stock
                            ) || 0,
                            JSON.stringify(
                                attributes
                            )
                        ]
                    );

                const saved =
                    variantResult.rows[0];

                savedVariants.push({

                    id:
                        saved.id,

                    name:
                        saved.name || "",

                    storage:
                        saved.storage || "",

                    color:
                        saved.color || "",

                    price:
                        Number(
                            saved.price
                        ) || 0,

                    stock:
                        Number(
                            saved.stock
                        ) || 0,

                    attributes:
                        saved.attributes || {}
                });
            }

            await client.query(
                "COMMIT"
            );

            const savedProduct =
                updateResult.rows[0];

            res.json({

                success: true,

                message:
                    "Produk berjaya dikemaskini.",

                product: {

                    id:
                        savedProduct.id,

                    name:
                        savedProduct.name,

                    description:
                        savedProduct.description || "",

                    price:
                        Number(
                            savedProduct.price
                        ) || 0,

                    stock:
                        Number(
                            savedProduct.stock
                        ) || 0,

                    category:
                        savedProduct.category || "",

                    image:
                        savedProduct.image || "",

                    createdAt:
                        savedProduct.created_at,

                    updatedAt:
                        savedProduct.updated_at,

                    variants:
                        savedVariants
                }
            });

        } catch (error) {

            try {

                await client.query(
                    "ROLLBACK"
                );

            } catch (
                rollbackError
            ) {

                console.error(
                    "Rollback update product error:",
                    rollbackError
                );
            }

            console.error(
                "Update product PostgreSQL error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Gagal mengemaskini produk."
            });

        } finally {

            client.release();
        }
    }
);
/* DELETE PRODUCT - ADMIN ONLY */

app.delete(
    "/api/products/:id",
    requireAdmin,
    async (req, res) => {

        const client =
            await db.connect();

        try {

            await client.query("BEGIN");

            const productId =
    Number(req.params.id);

console.log(
    "🗑️ DELETE PRODUCT DEBUG:",
    {
        rawId: req.params.id,
        numericId: productId
    }
);
            if (
                !Number.isInteger(productId)
            ) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Product ID tidak sah."
                });
            }

            const existingResult =
                await client.query(
                    `
                    SELECT *
                    FROM products
                    WHERE id = $1
                    `,
                    [productId]
                );

            if (
                existingResult.rows.length === 0
            ) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message:
                        "Produk tidak dijumpai."
                });
            }

            const deletedProduct =
                existingResult.rows[0];

            /*
                product_variants akan
                auto-delete sebab schema
                guna ON DELETE CASCADE.
            */

            await client.query(
                `
                DELETE FROM products
                WHERE id = $1
                `,
                [productId]
            );

            await client.query("COMMIT");

            res.json({
                success: true,
                message:
                    "Produk berjaya dipadam.",

                product: {
                    id:
                        deletedProduct.id,

                    name:
                        deletedProduct.name,

                    description:
                        deletedProduct.description || "",

                    price:
                        Number(
                            deletedProduct.price
                        ) || 0,

                    stock:
                        Number(
                            deletedProduct.stock
                        ) || 0,

                    category:
                        deletedProduct.category || "",

                    image:
                        deletedProduct.image || ""
                }
            });

        } catch (error) {

            try {

                await client.query(
                    "ROLLBACK"
                );

            } catch (
                rollbackError
            ) {

                console.error(
                    "Rollback delete product error:",
                    rollbackError
                );
            }

            console.error(
                "Delete product PostgreSQL error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Gagal memadam produk."
            });

        } finally {

            client.release();
        }
    }
);

/* =========================================================
   BILLPLZ HELPERS
========================================================= */

function createBillplzSignature(
    data
) {
    const keys =
        Object.keys(data)
            .sort();

    const source =
        keys
            .map(
                key =>
                    `${key}${data[key]}`
            )
            .join("|");

    return crypto
        .createHmac(
            "sha256",
            BILLPLZ_X_SIGNATURE_KEY
        )
        .update(source)
        .digest("hex");
}

async function createBillplzBill(
    order
) {
    if (
        !BILLPLZ_SECRET_KEY ||
        !BILLPLZ_COLLECTION_ID
    ) {
        throw new Error(
            "Billplz credentials belum lengkap."
        );
    }

    const fetch =
        (...args) =>
            import("node-fetch")
                .then(
                    ({
                        default: fetch
                    }) =>
                        fetch(
                            ...args
                        )
                );

    const callbackUrl =
        `${PUBLIC_URL}/api/payment/callback`;

    const redirectUrl =
        `${FRONTEND_URL}/payment-success.html?order=${encodeURIComponent(
            order.orderNumber
        )}`;

    const body =
        new URLSearchParams();

    body.append(
        "collection_id",
        BILLPLZ_COLLECTION_ID
    );

    body.append(
        "email",
        order.customer.email
    );

    body.append(
        "name",
        order.customer.name
    );

    body.append(
        "amount",
        String(
            toBillplzAmount(
                order.total
            )
        )
    );

    body.append(
        "description",
        `ZiqTech Order ${order.orderNumber}`
    );

    body.append(
        "callback_url",
        callbackUrl
    );

    body.append(
        "redirect_url",
        redirectUrl
    );

    const response =
        await fetch(
            `${BILLPLZ_BASE_URL}/v3/bills`,
            {
                method: "POST",

                headers: {
                    Authorization:
                        "Basic " +
                        Buffer.from(
                            `${BILLPLZ_SECRET_KEY}:`
                        ).toString(
                            "base64"
                        ),

                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body
            }
        );

    const data =
        await response.json();

    if (!response.ok) {
        console.error(
            "Billplz error:",
            data
        );

        throw new Error(
            data?.error ||
                "Gagal membuat Billplz bill."
        );
    }

    return data;
}

/* =========================================================
   CREATE PAYMENT / ORDER
========================================================= */

app.post(
    "/api/payment/create",
    async (req, res) => {

        console.log(
            "🔥 PAYMENT CREATE HIT",
            new Date().toISOString()
        );

        console.log(
            "🔥 PAYMENT ITEMS:",
            JSON.stringify(
                req.body?.items,
                null,
                2
            )
        );

        try {
            const {
                customer = {},
                shipping = {},
                items = [],
                paymentMethod =
                    "billplz"
            } = req.body;

            if (
                !customer.name ||
                !customer.email
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Nama dan email diperlukan."
                });
            }

            if (
                !Array.isArray(items) ||
                items.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Cart kosong."
                });
            }

            const products =
    await readProductsFromDB();

            const preparedItems =
                prepareOrderItems(
                    items,
                    products
                );

            const subtotal =
                calculateSubtotal(
                    preparedItems
                );

            const shippingState =
                String(
                    shipping.state || ""
                )
                    .trim()
                    .toLowerCase();

            const shippingFee =
                (
                    shippingState === "sabah" ||
                    shippingState === "sarawak"
                )
                    ? 15
                    : 0;

            const total =
                subtotal +
                shippingFee;

            const orderNumber =
                createOrderNumber();

            const order = {
                id:
                    `order-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 8)}`,

                orderNumber,

                date:
                    new Date().toISOString(),

                customer: {
                    name:
                        customer.name,

                    email:
                        customer.email,

                    phone:
                        customer.phone ||
                        ""
                },

                shipping: {
                    address:
                        shipping.address ||
                        "",

                    city:
                        shipping.city ||
                        "",

                    postcode:
                        shipping.postcode ||
                        "",

                    state:
                        shipping.state ||
                        ""
                },

                paymentMethod,

                paymentStatus:
                    PAYMENT_MODE ===
                    "DEMO"
                        ? "paid"
                        : "pending",

                status:
                    PAYMENT_MODE ===
                    "DEMO"
                        ? "processing"
                        : "pending",

                items:
                    preparedItems,

                subtotal,

                shippingFee,

                total
            };

            /*
             * Reserve/deduct stock when order
             * is successfully created.
             */
         const client =
    await db.connect();

try {

    await client.query(
        "BEGIN"
    );

    /*
     * Potong stock dalam PostgreSQL.
     */
    await deductStockFromDB(
        preparedItems,
        client
    );

    /*
     * Simpan order + order items
     * dalam PostgreSQL.
     */
    await saveOrderToDB(
        order,
        client
    );

    await client.query(
        "COMMIT"
    );

    console.log(
        "✅ ORDER SAVED TO POSTGRES:",
        order.orderNumber
    );

} catch (error) {

    await client.query(
        "ROLLBACK"
    );

    throw error;

} finally {

    client.release();
}

            /* =========================
   DEMO PAYMENT
========================= */

if (
    PAYMENT_MODE ===
    "DEMO"
) {
    return res.json({
        success: true,

        mode: "DEMO",

        message:
            "Order berjaya dibuat dalam DEMO mode.",

        order,

        orderId:
            order.id,

        orderNumber:
            order.orderNumber,

        amount:
            order.total,

        subtotal:
            order.subtotal,

        shippingFee:
            order.shippingFee,

        total:
            order.total,

        paymentUrl:
            `${FRONTEND_URL}/payment-success.html?order=${encodeURIComponent(
                order.orderNumber
            )}`
    });
}

            /* =========================
               BILLPLZ
            ========================= */

            if (
                PAYMENT_MODE ===
                "BILLPLZ"
            ) {
                const bill =
                    await createBillplzBill(
                        order
                    );

                order.billplz = {
                    id:
                        bill.id,

                    url:
                        bill.url,

                    reference1:
                        bill.reference_1 ||
                        ""
                };

                return res.json({
                    success: true,

                    mode: "BILLPLZ",

                    order,

                    orderId:
                        order.id,

                    orderNumber:
                        order.orderNumber,

                    paymentUrl:
                        bill.url
                });
            }

            return res.status(400).json({
                success: false,
                message:
                    "PAYMENT_MODE tidak sah."
            });
        } catch (error) {
            console.error(
                "Create payment error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Gagal membuat order."
            });
        }
    }
);

/* =========================================================
   DEMO PAYMENT CONFIRM
========================================================= */

app.post(
    "/api/payment/demo-confirm",

    async (req, res) => {

        try {

            const {
                orderId,
                orderNumber
            } = req.body;

            const result =
                await db.query(
                    `
                    UPDATE orders
                    SET
                        payment_status = 'paid',
                        status = 'processing',
                        paid_at = NOW()
                    WHERE
                        ($1::text IS NOT NULL AND id = $1)
                        OR
                        ($2::text IS NOT NULL AND order_number = $2)
                    RETURNING *
                    `,
                    [
                        orderId
                            ? String(orderId)
                            : null,

                        orderNumber
                            ? String(orderNumber)
                            : null
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Order tidak dijumpai."
                });
            }

            const row =
                result.rows[0];

            const order = {
                id: row.id,

                orderNumber:
                    row.order_number,

                orderDate:
                    row.order_date,

                customerName:
                    row.customer_name,

                customerEmail:
                    row.customer_email,

                customerPhone:
                    row.customer_phone,

                shipping: {
                    address:
                        row.shipping_address || "",

                    city:
                        row.shipping_city || "",

                    postcode:
                        row.shipping_postcode || "",

                    state:
                        row.shipping_state || ""
                },

                paymentMethod:
                    row.payment_method,

                paymentStatus:
                    row.payment_status,

                status:
                    row.status,

                subtotal:
                    Number(row.subtotal),

                shippingFee:
                    Number(row.shipping_fee),

                total:
                    Number(row.total),

                paidAt:
                    row.paid_at
            };

            return res.json({
                success: true,

                message:
                    "Pembayaran DEMO berjaya.",

                order,

                orderId:
                    order.id,

                orderNumber:
                    order.orderNumber,

                amount:
                    order.total,

                total:
                    order.total,

                subtotal:
                    order.subtotal,

                shippingFee:
                    order.shippingFee
            });

        } catch (error) {

            console.error(
                "Demo confirm error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mengesahkan pembayaran."
            });
        }
    }
);

/* =========================================================
   BILLPLZ CALLBACK
========================================================= */

app.post(
    "/api/payment/callback",

    async (req, res) => {

        try {

            const data =
                req.body || {};

            console.log(
                "Billplz callback:",
                data
            );

            const orderNumber =
                data.reference_1
                    ? String(
                        data.reference_1
                    )
                    : "";

            if (!orderNumber) {

                console.log(
                    "⚠️ Billplz callback tiada reference_1."
                );

                return res.json({
                    success: true
                });
            }

            const paid =
                String(
                    data.paid
                ).toLowerCase() ===
                "true";

            const state =
                String(
                    data.state || ""
                ).toLowerCase();

            const isPaid =
                paid ||
                state === "paid";

            const result =
                await db.query(
                    `
                    UPDATE orders

                    SET
                        payment_status = $2,

                        status =
                            CASE
                                WHEN $2 = 'paid'
                                THEN 'processing'
                                ELSE status
                            END,

                        paid_at =
                            CASE
                                WHEN $2 = 'paid'
                                THEN COALESCE(
                                    paid_at,
                                    NOW()
                                )
                                ELSE paid_at
                            END

                    WHERE order_number = $1

                    RETURNING
                        id,
                        order_number,
                        payment_status,
                        status,
                        paid_at
                    `,
                    [
                        orderNumber,
                        isPaid
                            ? "paid"
                            : "failed"
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                console.log(
                    "⚠️ Billplz order tidak dijumpai:",
                    orderNumber
                );

            } else {

                console.log(
                    "✅ BILLPLZ ORDER UPDATED IN POSTGRES:",
                    result.rows[0].order_number,
                    result.rows[0].payment_status
                );
            }

            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "Billplz callback error:",
                error
            );

            return res.status(500).json({
                success: false
            });
        }
    }
);
/* =========================================================
   PAYMENT STATUS
========================================================= */

app.get(
    "/api/payment/status/:orderId",

    async (req, res) => {

        try {

            const lookup =
                String(
                    req.params.orderId
                );

            const result =
                await db.query(
                    `
                    SELECT
                        id,
                        order_number,
                        payment_status,
                        status
                    FROM orders
                    WHERE
                        id = $1
                        OR order_number = $1
                    LIMIT 1
                    `,
                    [lookup]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Order tidak dijumpai."
                });
            }

            const row =
                result.rows[0];

            return res.json({
                success: true,

                orderId:
                    row.id,

                orderNumber:
                    row.order_number,

                paymentStatus:
                    row.payment_status,

                status:
                    row.status
            });

        } catch (error) {

            console.error(
                "Payment status error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mendapatkan status pembayaran."
            });
        }
    }
);
/* =========================================================
   CUSTOMER - GET MY ORDERS
========================================================= */

/* =========================================================
   CUSTOMER - GET MY ORDERS
========================================================= */

app.get(
    "/api/my-orders",

    requireAuth,

    async (req, res) => {

        try {

            const userEmail =
                String(
                    req.session.user?.email || ""
                )
                .trim()
                .toLowerCase();

            if (!userEmail) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Sila login terlebih dahulu."
                });
            }

            const result =
                await db.query(
                    `
                    SELECT
                        o.id,
                        o.order_number,
                        o.order_date,
                        o.customer_name,
                        o.customer_email,
                        o.customer_phone,
                        o.shipping_address,
                        o.shipping_city,
                        o.shipping_postcode,
                        o.shipping_state,
                        o.payment_method,
                        o.payment_status,
                        o.status,
                        o.subtotal,
                        o.shipping_fee,
                        o.total,
                        o.paid_at,

                        COALESCE(
                            json_agg(
                                json_build_object(
                                    'productId', oi.product_id,
                                    'variantId', oi.variant_id,
                                    'name', oi.name,
                                    'variantName', oi.variant_name,
                                    'attributes', oi.attributes,
                                    'price', oi.price,
                                    'quantity', oi.quantity,
                                    'image', oi.image
                                )
                                ORDER BY oi.id
                            )
                            FILTER (
                                WHERE oi.id IS NOT NULL
                            ),
                            '[]'::json
                        ) AS items

                    FROM orders o

                    LEFT JOIN order_items oi
                        ON oi.order_id = o.id

                    WHERE LOWER(
                        TRIM(o.customer_email)
                    ) = $1

                    GROUP BY o.id

                    ORDER BY o.order_date DESC
                    `,
                    [userEmail]
                );

            const myOrders =
                result.rows.map(row => ({
                    id:
                        row.id,

                    orderNumber:
                        row.order_number,

                    date:
                        row.order_date,

                    customer: {
                        name:
                            row.customer_name || "",
                        email:
                            row.customer_email || "",
                        phone:
                            row.customer_phone || ""
                    },

                    shipping: {
                        address:
                            row.shipping_address || "",
                        city:
                            row.shipping_city || "",
                        postcode:
                            row.shipping_postcode || "",
                        state:
                            row.shipping_state || ""
                    },

                    paymentMethod:
                        row.payment_method,

                    paymentStatus:
                        row.payment_status,

                    status:
                        row.status,

                    items:
                        row.items || [],

                    subtotal:
                        Number(row.subtotal),

                    shippingFee:
                        Number(row.shipping_fee),

                    total:
                        Number(row.total),

                    paidAt:
                        row.paid_at
                }));

            return res.json({
                success: true,
                orders: myOrders
            });

        } catch (error) {

            console.error(
                "Get my orders error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mendapatkan order anda."
            });
        }
    }
);
/* =========================================================
   CUSTOMER ORDER LOOKUP
========================================================= */

app.get(

    "/api/orders/:orderId",

    requireAuth,

    async (req, res) => {

        try {

            const lookup =
                String(
                    req.params.orderId
                );

            const result =
                await db.query(
                    `
                    SELECT
                        o.id,
                        o.order_number,
                        o.order_date,
                        o.customer_name,
                        o.customer_email,
                        o.customer_phone,
                        o.shipping_address,
                        o.shipping_city,
                        o.shipping_postcode,
                        o.shipping_state,
                        o.payment_method,
                        o.payment_status,
                        o.status,
                        o.subtotal,
                        o.shipping_fee,
                        o.total,
                        o.paid_at,

                        COALESCE(
                            json_agg(
                                json_build_object(
                                    'productId', oi.product_id,
                                    'variantId', oi.variant_id,
                                    'name', oi.name,
                                    'variantName', oi.variant_name,
                                    'attributes', oi.attributes,
                                    'price', oi.price,
                                    'quantity', oi.quantity,
                                    'image', oi.image
                                )
                                ORDER BY oi.id
                            )
                            FILTER (
                                WHERE oi.id IS NOT NULL
                            ),
                            '[]'::json
                        ) AS items

                    FROM orders o

                    LEFT JOIN order_items oi
                        ON oi.order_id = o.id

                    WHERE
                        o.id = $1
                        OR o.order_number = $1

                    GROUP BY o.id

                    LIMIT 1
                    `,
                    [lookup]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Order tidak dijumpai."
                });
            }

            const row =
                result.rows[0];

            const sessionUser =
                req.session.user;

            const isAdminUser =
                sessionUser.role === "admin";

            const sessionEmail =
                String(
                    sessionUser.email || ""
                )
                    .trim()
                    .toLowerCase();

            const orderEmail =
                String(
                    row.customer_email || ""
                )
                    .trim()
                    .toLowerCase();

            if (
                !isAdminUser &&
                (
                    !sessionEmail ||
                    !orderEmail ||
                    sessionEmail !== orderEmail
                )
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Anda tidak dibenarkan melihat order ini."
                });
            }

            const order = {

                id:
                    row.id,

                orderNumber:
                    row.order_number,

                date:
                    row.order_date,

                customer: {
                    name:
                        row.customer_name || "",
                    email:
                        row.customer_email || "",
                    phone:
                        row.customer_phone || ""
                },

                shipping: {
                    address:
                        row.shipping_address || "",
                    city:
                        row.shipping_city || "",
                    postcode:
                        row.shipping_postcode || "",
                    state:
                        row.shipping_state || ""
                },

                paymentMethod:
                    row.payment_method,

                paymentStatus:
                    row.payment_status,

                status:
                    row.status,

                items:
                    row.items || [],

                subtotal:
                    Number(row.subtotal),

                shippingFee:
                    Number(row.shipping_fee),

                total:
                    Number(row.total),

                paidAt:
                    row.paid_at
            };

            return res.json({
                success: true,
                order
            });

        } catch (error) {

            console.error(
                "Get order error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mendapatkan order."
            });
        }
    }
);
/* =========================================================
   GET ALL ORDERS - ADMIN ONLY
========================================================= */

app.get(
    "/api/orders",

    requireAdmin,

    async (req, res) => {

        try {

            const result =
                await db.query(
                    `
                    SELECT
                        o.id,
                        o.order_number,
                        o.order_date,
                        o.customer_name,
                        o.customer_email,
                        o.customer_phone,
                        o.shipping_address,
                        o.shipping_city,
                        o.shipping_postcode,
                        o.shipping_state,
                        o.payment_method,
                        o.payment_status,
                        o.status,
                        o.subtotal,
                        o.shipping_fee,
                        o.total,
                        o.paid_at,

                        COALESCE(
                            json_agg(
                                json_build_object(
                                    'productId', oi.product_id,
                                    'variantId', oi.variant_id,
                                    'name', oi.name,
                                    'variantName', oi.variant_name,
                                    'attributes', oi.attributes,
                                    'price', oi.price,
                                    'quantity', oi.quantity,
                                    'image', oi.image
                                )
                                ORDER BY oi.id
                            )
                            FILTER (
                                WHERE oi.id IS NOT NULL
                            ),
                            '[]'::json
                        ) AS items

                    FROM orders o

                    LEFT JOIN order_items oi
                        ON oi.order_id = o.id

                    GROUP BY o.id

                    ORDER BY o.order_date DESC
                    `
                );

            const orders =
                result.rows.map(row => ({

                    id:
                        row.id,

                    orderNumber:
                        row.order_number,

                    date:
                        row.order_date,

                    customer: {
                        name:
                            row.customer_name || "",
                        email:
                            row.customer_email || "",
                        phone:
                            row.customer_phone || ""
                    },

                    shipping: {
                        address:
                            row.shipping_address || "",
                        city:
                            row.shipping_city || "",
                        postcode:
                            row.shipping_postcode || "",
                        state:
                            row.shipping_state || ""
                    },

                    paymentMethod:
                        row.payment_method,

                    paymentStatus:
                        row.payment_status,

                    status:
                        row.status,

                    items:
                        row.items || [],

                    subtotal:
                        Number(row.subtotal),

                    shippingFee:
                        Number(row.shipping_fee),

                    total:
                        Number(row.total),

                    paidAt:
                        row.paid_at
                }));

            return res.json({
                success: true,
                orders
            });

        } catch (error) {

            console.error(
                "Get all orders error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mendapatkan orders."
            });
        }
    }
);
/* =========================================================
   CREATE ORDER - LEGACY
========================================================= */

app.post(
    "/api/orders",

    async (req, res) => {

        let client;

        try {

            if (
                req.session.user &&
                req.session.user.role === "admin"
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Admin tidak dibenarkan membuat order."
                });
            }

            const {
                customer = {},
                shipping = {},
                items = [],
                paymentMethod = "cod"
            } = req.body;

            if (
                !customer.name ||
                !customer.email
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Maklumat customer diperlukan."
                });
            }

            if (
                !Array.isArray(items) ||
                items.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Order mesti mempunyai item."
                });
            }

            const products =
                await readProductsFromDB();

            const preparedItems =
                prepareOrderItems(
                    items,
                    products
                );

            const subtotal =
                calculateSubtotal(
                    preparedItems
                );

            const shippingState =
                String(
                    shipping.state || ""
                )
                    .trim()
                    .toLowerCase();

            const shippingFee =
                (
                    shippingState === "sabah" ||
                    shippingState === "sarawak"
                )
                    ? 15
                    : 0;

            const total =
                subtotal +
                shippingFee;

            const order = {

                id:
                    `order-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 8)}`,

                orderNumber:
                    createOrderNumber(),

                date:
                    new Date().toISOString(),

                customer: {
                    name:
                        customer.name,
                    email:
                        customer.email,
                    phone:
                        customer.phone || ""
                },

                shipping: {
                    address:
                        shipping.address || "",
                    city:
                        shipping.city || "",
                    postcode:
                        shipping.postcode || "",
                    state:
                        shipping.state || ""
                },

                paymentMethod,

                paymentStatus:
                    "pending",

                status:
                    "pending",

                items:
                    preparedItems,

                subtotal,

                shippingFee,

                total
            };

            client =
                await db.connect();

            await client.query(
                "BEGIN"
            );

            await deductStockFromDB(
                preparedItems,
                client
            );

            await saveOrderToDB(
                order,
                client
            );

            await client.query(
                "COMMIT"
            );

            console.log(
                "✅ LEGACY ORDER SAVED TO POSTGRES:",
                order.orderNumber
            );

            return res.status(201).json({
                success: true,
                message:
                    "Order berjaya dibuat.",
                order
            });

        } catch (error) {

            if (client) {

                try {
                    await client.query(
                        "ROLLBACK"
                    );
                } catch (
                    rollbackError
                ) {
                    console.error(
                        "Rollback error:",
                        rollbackError
                    );
                }
            }

            console.error(
                "Legacy create order error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Gagal membuat order."
            });

        } finally {

            if (client) {
                client.release();
            }
        }
    }
);

/* =========================================================
   UPDATE ORDER - ADMIN ONLY
========================================================= */

app.put(
    "/api/orders/:orderId",

    requireAdmin,

    async (req, res) => {

        try {

            const lookup =
                String(
                    req.params.orderId
                );

            const {
                status,
                paymentStatus
            } = req.body;

            const result =
                await db.query(
                    `
                    UPDATE orders
                    SET
                        status =
                            COALESCE(
                                $2,
                                status
                            ),

                        payment_status =
                            COALESCE(
                                $3,
                                payment_status
                            ),

                        paid_at =
                            CASE
                                WHEN $3 = 'paid'
                                     AND paid_at IS NULL
                                THEN NOW()
                                ELSE paid_at
                            END

                    WHERE
                        id = $1
                        OR order_number = $1

                    RETURNING *
                    `,
                    [
                        lookup,

                        status !== undefined
                            ? String(status)
                            : null,

                        paymentStatus !== undefined
                            ? String(paymentStatus)
                            : null
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Order tidak dijumpai."
                });
            }

            const row =
                result.rows[0];

            const itemsResult =
                await db.query(
                    `
                    SELECT
                        product_id,
                        variant_id,
                        name,
                        variant_name,
                        attributes,
                        price,
                        quantity,
                        image
                    FROM order_items
                    WHERE order_id = $1
                    ORDER BY id
                    `,
                    [row.id]
                );

            const updated = {

                id:
                    row.id,

                orderNumber:
                    row.order_number,

                date:
                    row.order_date,

                customer: {
                    name:
                        row.customer_name || "",
                    email:
                        row.customer_email || "",
                    phone:
                        row.customer_phone || ""
                },

                shipping: {
                    address:
                        row.shipping_address || "",
                    city:
                        row.shipping_city || "",
                    postcode:
                        row.shipping_postcode || "",
                    state:
                        row.shipping_state || ""
                },

                paymentMethod:
                    row.payment_method,

                paymentStatus:
                    row.payment_status,

                status:
                    row.status,

                subtotal:
                    Number(row.subtotal),

                shippingFee:
                    Number(row.shipping_fee),

                total:
                    Number(row.total),

                paidAt:
                    row.paid_at,

                items:
                    itemsResult.rows.map(
                        item => ({
                            productId:
                                item.product_id,

                            variantId:
                                item.variant_id,

                            name:
                                item.name,

                            variantName:
                                item.variant_name,

                            attributes:
                                item.attributes || {},

                            price:
                                Number(item.price),

                            quantity:
                                Number(item.quantity),

                            image:
                                item.image || ""
                        })
                    )
            };

            return res.json({
                success: true,
                message:
                    "Order berjaya dikemaskini.",
                order:
                    updated
            });

        } catch (error) {

            console.error(
                "Update order error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal mengemaskini order."
            });
        }
    }
);
/* =========================================================
   DELETE ORDER - ADMIN ONLY
========================================================= */

app.delete(
    "/api/orders/:orderId",

    requireAdmin,

    async (req, res) => {

        try {

            const lookup =
                String(
                    req.params.orderId
                );

            const result =
                await db.query(
                    `
                    DELETE FROM orders

                    WHERE
                        id = $1
                        OR order_number = $1

                    RETURNING *
                    `,
                    [lookup]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Order tidak dijumpai."
                });
            }

            const row =
                result.rows[0];

            const deleted = {

                id:
                    row.id,

                orderNumber:
                    row.order_number,

                date:
                    row.order_date,

                customer: {
                    name:
                        row.customer_name || "",
                    email:
                        row.customer_email || "",
                    phone:
                        row.customer_phone || ""
                },

                shipping: {
                    address:
                        row.shipping_address || "",
                    city:
                        row.shipping_city || "",
                    postcode:
                        row.shipping_postcode || "",
                    state:
                        row.shipping_state || ""
                },

                paymentMethod:
                    row.payment_method,

                paymentStatus:
                    row.payment_status,

                status:
                    row.status,

                subtotal:
                    Number(row.subtotal),

                shippingFee:
                    Number(row.shipping_fee),

                total:
                    Number(row.total),

                paidAt:
                    row.paid_at
            };

            return res.json({
                success: true,
                message:
                    "Order berjaya dipadam.",
                order:
                    deleted
            });

        } catch (error) {

            console.error(
                "Delete order error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Gagal memadam order."
            });
        }
    }
);

/* =========================================================
   MALAYSIA POSTCODE API
========================================================= */

app.get(
    "/api/postcode/:postcode",
    async (req, res) => {
        try {

            const postcode =
                String(
                    req.params.postcode || ""
                )
                    .replace(/\D/g, "")
                    .slice(0, 5);

            if (
                !/^\d{5}$/.test(
                    postcode
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Postcode mesti mengandungi 5 digit."
                });
            }

            const result =
                await db.query(
                    `
                    SELECT
                        postcode,
                        city,
                        state
                    FROM malaysia_postcodes
                    WHERE postcode = $1
                    LIMIT 1
                    `,
                    [postcode]
                );

            const location =
                result.rows[0];

            if (!location) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Postcode tidak dijumpai."
                });
            }

            return res.json({
                success: true,
                postcode:
                    location.postcode,
                city:
                    location.city || "",
                state:
                    location.state || ""
            });

        } catch (error) {

            console.error(
                "Postcode PostgreSQL error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Ralat server semasa mencari postcode."
            });
        }
    }
);


/* =========================================================
   ADMIN PAGE PROTECTION
========================================================= */

/*
 * Admin page itself is protected.
 *
 * /admin-login.html remains public.
 * /admin.html requires admin session.
 */

app.get(
    "/admin.html",
    requireAdmin,
    (req, res) => {
        res.sendFile(
            path.join(
                frontendFolder,
                "admin.html"
            )
        );
    }
);

/* =========================================================
   STATIC FRONTEND
========================================================= */

app.use(
    express.static(
        frontendFolder
    )
);

/* =========================================================
   FRONTEND FALLBACK
========================================================= */

app.use(
    (req, res, next) => {
        /*
         * API route not found
         */
        if (
            req.path.startsWith(
                "/api/"
            )
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "API endpoint tidak dijumpai."
            });
        }

        /*
         * If browser requests an HTML page,
         * return index.html.
         */
        if (
            req.method === "GET" &&
            req.accepts("html")
        ) {
            const indexFile =
                path.join(
                    frontendFolder,
                    "index.html"
                );

            if (
                fs.existsSync(
                    indexFile
                )
            ) {
                return res.sendFile(
                    indexFile
                );
            }
        }

        next();
    }
);

/* =========================================================
   404 HANDLER
========================================================= */

app.use(
    (req, res) => {
        res.status(404).json({
            success: false,
            message:
                "Page tidak dijumpai."
        });
    }
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {
        console.error(
            "Unhandled server error:",
            error
        );

        if (
            res.headersSent
        ) {
            return next(error);
        }

        res.status(500).json({
            success: false,
            message:
                "Internal server error."
        });
    }
);

createDefaultAdmin();

/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    () => {
        console.log("");
        console.log(
            "========================================"
        );
        console.log(
            "          ZIQTECH SERVER"
        );
        console.log(
            "========================================"
        );
        console.log(
            `🚀 Local: http://localhost:${PORT}`
        );
        console.log(
            `🛒 Store: http://localhost:${PORT}`
        );
        console.log(
            `🔐 Admin Login: http://localhost:${PORT}/admin-login.html`
        );
        console.log(
            `⚙️ Admin: http://localhost:${PORT}/admin.html`
        );
        console.log(
            `💳 Payment Mode: ${PAYMENT_MODE}`
        );
        console.log(
            "========================================"
        );
        console.log("");
    }
);
