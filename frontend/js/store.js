
(function (window) {
    /*
     * =========================================================
     * ZIQTECH STORE
     * Central cart manager
     *
     * Cart is separated by logged-in user.
     * Guest users have their own cart.
     * =========================================================
     */

    const OLD_CART_KEY = "ziqtech_cart";
    const GUEST_CART_KEY = "ziqtech_cart_guest";


    // =========================================================
    // CURRENT USER
    // =========================================================

    function getCurrentUser() {
        try {
            const raw = localStorage.getItem("ziqtech_current_user");

            if (!raw) {
                return null;
            }

            const user = JSON.parse(raw);

            if (!user || typeof user !== "object") {
                return null;
            }

            return user;
        } catch (error) {
            return null;
        }
    }


    // =========================================================
    // CART KEY
    // =========================================================

    function getCartKey() {
        const user = getCurrentUser();

        if (user) {
            if (user.id !== undefined && user.id !== null) {
                return `ziqtech_cart_user_${user.id}`;
            }

            if (user.email) {
                return (
                    "ziqtech_cart_user_" +
                    String(user.email).trim().toLowerCase()
                );
            }
        }

        return GUEST_CART_KEY;
    }


    // =========================================================
    // MIGRATE OLD CART
    // =========================================================

    function migrateOldCart() {
        try {
            const newKey = getCartKey();

            if (newKey === OLD_CART_KEY) {
                return;
            }

            const oldCart = localStorage.getItem(OLD_CART_KEY);

            if (!oldCart) {
                return;
            }

            const existingCart = localStorage.getItem(newKey);

            /*
             * Only move the old cart if the current user's
             * new cart does not already exist.
             */
            if (!existingCart) {
                localStorage.setItem(newKey, oldCart);
            }

            localStorage.removeItem(OLD_CART_KEY);

        } catch (error) {
            console.warn("Cart migration failed:", error);
        }
    }


    // Run migration immediately.
    migrateOldCart();


    // =========================================================
    // READ CART
    // =========================================================

    function readCart() {
        try {
            const cartKey = getCartKey();

            const cart =
                JSON.parse(localStorage.getItem(cartKey)) || [];

            return Array.isArray(cart) ? cart : [];

        } catch (error) {
            return [];
        }
    }


    // =========================================================
    // SAVE CART
    // =========================================================

    function saveCart(cart) {
        try {
            const cartKey = getCartKey();

            localStorage.setItem(
                cartKey,
                JSON.stringify(normalizeCart(cart))
            );

        } catch (error) {
            console.error("Unable to save cart:", error);
        }
    }


    // =========================================================
    // PRODUCT ID
    // =========================================================

    function productIdOf(item) {
        if (item == null) {
            return null;
        }

        if (
            item.productId !== undefined &&
            item.productId !== null
        ) {
            return item.productId;
        }

        return item.id;
    }


    // =========================================================
    // VARIANT ID
    // =========================================================

    function variantIdOf(item) {
        if (
            item &&
            item.variantId !== undefined &&
            item.variantId !== null &&
            String(item.variantId) !== ""
        ) {
            return item.variantId;
        }

        return null;
    }


    // =========================================================
    // SAME CART LINE
    // =========================================================

    function sameLine(item, productId, variantId) {
        return (
            String(productIdOf(item)) === String(productId) &&
            String(variantIdOf(item) || "") ===
                String(variantId || "")
        );
    }


    // =========================================================
    // FIND VARIANT
    // =========================================================

    function getVariant(product, variantId) {
        if (
            !product ||
            !Array.isArray(product.variants) ||
            variantId === undefined ||
            variantId === null ||
            String(variantId) === ""
        ) {
            return null;
        }

        return (
            product.variants.find((variant, index) => {
                const realId =
                    variant &&
                    variant.id !== undefined &&
                    variant.id !== null
                        ? variant.id
                        : `${product.id}-variant-${index}`;

                return (
                    String(realId) ===
                    String(variantId)
                );
            }) || null
        );
    }


    // =========================================================
    // GET VARIANT ID
    // =========================================================

    function getVariantId(product, variant, index) {
        if (!variant) {
            return null;
        }

        if (
            variant.id !== undefined &&
            variant.id !== null &&
            String(variant.id) !== ""
        ) {
            return variant.id;
        }

        return `${product.id}-variant-${index}`;
    }


    // =========================================================
    // GET VARIANT LABEL
    // =========================================================

    // =========================================================
// VARIANT ATTRIBUTES
// =========================================================

function getVariantAttributes(variant) {
    if (!variant) {
        return {};
    }

    if (
        variant.attributes &&
        typeof variant.attributes === "object" &&
        !Array.isArray(variant.attributes)
    ) {
        return {
            ...variant.attributes
        };
    }

    const attributes = {};

    if (variant.storage) {
        attributes.storage =
            variant.storage;
    }

    if (variant.color) {
        attributes.color =
            variant.color;
    }

    if (variant.colour) {
        attributes.color =
            variant.colour;
    }

    if (variant.size) {
        attributes.size =
            variant.size;
    }

    if (variant.type) {
        attributes.type =
            variant.type;
    }

    if (variant.ram) {
        attributes.ram =
            variant.ram;
    }

    if (variant.chip) {
        attributes.chip =
            variant.chip;
    }

    if (variant.case) {
        attributes.case =
            variant.case;
    }

    if (variant.band) {
        attributes.band =
            variant.band;
    }

    if (variant.generation) {
        attributes.generation =
            variant.generation;
    }

    if (variant.compatibility) {
        attributes.compatibility =
            variant.compatibility;
    }

    return attributes;
}


// =========================================================
// GET VARIANT LABEL
// =========================================================

function getVariantLabel(
    product,
    variant,
    index
) {
    if (!variant) {
        return "";
    }

    const attributes =
        getVariantAttributes(
            variant
        );

    const parts =
        Object.entries(attributes)
            .filter(
                ([key, value]) =>
                    value !== undefined &&
                    value !== null &&
                    String(value).trim() !== ""
            )
            .map(
                ([key, value]) =>
                    `${key}: ${String(value).trim()}`
            );

    if (parts.length) {
        return parts.join(" / ");
    }

    if (variant.name) {
        return variant.name;
    }

    if (variant.label) {
        return variant.label;
    }

    return `Option ${Number(index || 0) + 1}`;
}

    // =========================================================
    // STOCK
    // =========================================================

    function getStock(product, variantId) {
        if (!product) {
            return 0;
        }

        const variant = getVariant(product, variantId);

        if (variant) {
            return Math.max(
                0,
                Number(variant.stock || 0)
            );
        }

        return Math.max(
            0,
            Number(product.stock || 0)
        );
    }


    // =========================================================
    // PRICE
    // =========================================================

    function getPrice(product, variantId) {
        if (!product) {
            return 0;
        }

        const variant = getVariant(product, variantId);

        if (variant) {
            return Number(variant.price || 0);
        }

        return Number(product.price || 0);
    }


    // =========================================================
    // DISPLAY NAME
    // =========================================================

    function getDisplayName(product, variantId) {
        if (!product) {
            return "";
        }

        const variant = getVariant(
            product,
            variantId
        );

        if (variant) {
            const index = Array.isArray(product.variants)
                ? product.variants.indexOf(variant)
                : -1;

            const label = getVariantLabel(
                product,
                variant,
                index >= 0 ? index : 0
            );

            if (label) {
                return `${product.name} — ${label}`;
            }
        }

        return product.name || "";
    }


    // =========================================================
// NORMALIZE CART
// =========================================================

function normalizeCart(cart) {

    const merged = [];

    (cart || []).forEach((item) => {

        const productId =
            productIdOf(item);

        if (
            productId === undefined ||
            productId === null ||
            productId === ""
        ) {
            return;
        }

        const quantity =
            Number(
                item.quantity || 1
            );

        if (
            !Number.isFinite(quantity) ||
            quantity < 1
        ) {
            return;
        }

        const variantId =
            variantIdOf(item);

        const existing =
            merged.find((row) =>
                sameLine(
                    row,
                    productId,
                    variantId
                )
            );

        if (existing) {

            existing.quantity +=
                quantity;

            return;
        }

        const row = {
            productId:
                productId,

            quantity:
                quantity
        };

        if (
            variantId !== undefined &&
            variantId !== null &&
            String(variantId) !== ""
        ) {
            row.variantId =
                variantId;
        }

        /*
         * Keep variant attributes
         * separate inside cart.
         */
        if (
            item.attributes &&
            typeof item.attributes === "object" &&
            !Array.isArray(item.attributes)
        ) {
            row.attributes = {
                ...item.attributes
            };
        }

        merged.push(row);
    });

    return merged;
}

   // =========================================================
// ADD TO CART
// =========================================================

function addToCart(
    productId,
    quantity,
    stock,
    variantId,
    attributes
) {

    const cart =
        normalizeCart(
            readCart()
        );

    const addQuantity =
        Number(
            quantity || 1
        );

    const available =
        Number(stock);

    if (
        !Number.isFinite(
            addQuantity
        ) ||
        addQuantity < 1
    ) {
        return {
            ok: false,
            reason:
                "invalid_quantity"
        };
    }

    if (
        !Number.isFinite(
            available
        ) ||
        available <= 0
    ) {
        return {
            ok: false,
            reason:
                "out_of_stock"
        };
    }

    const existing =
        cart.find((item) =>
            sameLine(
                item,
                productId,
                variantId
            )
        );

    const current =
        existing
            ? Number(
                existing.quantity
            )
            : 0;

    if (
        current +
        addQuantity >
        available
    ) {
        return {
            ok: false,
            reason:
                "max_stock",

            stock:
                available
        };
    }

    if (existing) {

        existing.quantity =
            current +
            addQuantity;

        /*
         * Refresh attributes
         * in case product data
         * has changed.
         */
        if (
            attributes &&
            typeof attributes === "object" &&
            !Array.isArray(attributes)
        ) {
            existing.attributes = {
                ...attributes
            };
        }

    } else {

        const row = {
            productId:
                productId,

            quantity:
                addQuantity
        };

        if (
            variantId !== undefined &&
            variantId !== null &&
            String(variantId) !== ""
        ) {
            row.variantId =
                variantId;
        }

        if (
            attributes &&
            typeof attributes === "object" &&
            !Array.isArray(attributes)
        ) {
            row.attributes = {
                ...attributes
            };
        }

        cart.push(row);
    }

    saveCart(cart);

    return {
        ok: true,
        cart: cart
    };
}


    // =========================================================
    // CART COUNT
    // =========================================================

    function cartCount(cart) {
        const source =
            cart !== undefined
                ? cart
                : readCart();

        return (source || []).reduce(
            (total, item) =>
                total +
                Number(item.quantity || 0),
            0
        );
    }


    // =========================================================
    // CLEAR CART
    // =========================================================

    function clearCart() {
        try {
            localStorage.removeItem(
                getCartKey()
            );
        } catch (error) {
            console.error(
                "Unable to clear cart:",
                error
            );
        }
    }


    // =========================================================
    // EXPORT
    // =========================================================

    window.ZiqStore = {

        getCurrentUser: getCurrentUser,
        getCartKey: getCartKey,

        readCart: readCart,
        saveCart: saveCart,
        clearCart: clearCart,

        productIdOf: productIdOf,
        variantIdOf: variantIdOf,
        sameLine: sameLine,

        getVariant: getVariant,
        getVariantId: getVariantId,
        getVariantLabel: getVariantLabel,
        getVariantAttributes:getVariantAttributes,

        getStock: getStock,
        getPrice: getPrice,
        getDisplayName: getDisplayName,

        normalizeCart: normalizeCart,
        addToCart: addToCart,
        cartCount: cartCount
    };

})(window);
