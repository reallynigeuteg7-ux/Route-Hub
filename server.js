require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const EMAIL_USER = String(process.env.EMAIL_USER || '').trim();
const EMAIL_PASS = String(process.env.EMAIL_PASS || '').replace(/\s+/g, '');

let lastEmailSendError = null;

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
});

async function sendEmail({ to, subject, html, text }) {
    try {
        lastEmailSendError = null;
        if (!EMAIL_USER || !EMAIL_PASS) {
            lastEmailSendError = {
                code: 'EMAIL_CONFIG_MISSING',
                responseCode: null,
                message: 'EMAIL_USER and EMAIL_PASS are not configured',
                response: null
            };
            console.error('Email send error:', lastEmailSendError);
            return false;
        }
        await transporter.sendMail({
            from: '"RouteHub" <' + EMAIL_USER + '>',
            to,
            subject,
            text,
            html,
            headers: {
                'Content-Language': 'ru'
            }
        });
        console.log('Email sent:', to);
        return true;
    } catch (err) {
        lastEmailSendError = {
            code: err.code || null,
            responseCode: err.responseCode || null,
            message: err.message || null,
            response: err.response || null
        };
        console.error('Email send error:', lastEmailSendError);
        return false;
    }
}


function escapeEmailHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatEmailMoney(value, currency = 'KZT') {
    const numeric = Number(value || 0);
    const label = currency === 'KZT' ? '₸' : currency;

    if (!Number.isFinite(numeric)) {
        return `${escapeEmailHtml(value || 0)} ${escapeEmailHtml(label)}`;
    }

    return `${numeric.toLocaleString('ru-RU')} ${escapeEmailHtml(label)}`;
}

async function sendOfferNotificationEmail({ loadId, offerId, ownerEmail, ownerName, load, carrier, offer }) {
    if (!ownerEmail) {
        console.warn('Offer email skipped: load owner has no email', { loadId, offerId });
        return;
    }

    const route = `${load?.from_location || 'Не указано'} → ${load?.to_location || 'Не указано'}`;
    const subject = `Новая ставка на груз #${loadId} — RouteHub`;

    await sendEmail({
        to: ownerEmail,
        subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
                <div style="background: #081120; color: #ffffff; padding: 22px 24px; border-radius: 16px 16px 0 0;">
                    <h2 style="margin: 0; font-size: 24px;">Новая ставка на ваш груз</h2>
                    <p style="margin: 8px 0 0; color: #cbd5e1;">RouteHub уведомляет: перевозчик отправил предложение.</p>
                </div>

                <div style="border: 1px solid #e2e8f0; border-top: 0; padding: 22px 24px; border-radius: 0 0 16px 16px;">
                    <p style="margin: 0 0 16px;">Здравствуйте${ownerName ? `, ${escapeEmailHtml(ownerName)}` : ''}!</p>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; margin-bottom: 16px;">
                        <div style="font-size: 13px; color: #64748b; margin-bottom: 6px;">Груз</div>
                        <div style="font-size: 18px; font-weight: 800; margin-bottom: 8px;">${escapeEmailHtml(load?.type || 'Груз')}</div>
                        <div style="font-size: 15px; font-weight: 700;">${escapeEmailHtml(route)}</div>
                    </div>

                    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 14px; padding: 16px; margin-bottom: 16px;">
                        <div style="font-size: 13px; color: #1d4ed8; margin-bottom: 6px;">Ставка</div>
                        <div style="font-size: 24px; font-weight: 900; color: #1d4ed8;">${formatEmailMoney(offer?.price, offer?.currency || 'KZT')}</div>
                        <div style="margin-top: 10px; color: #334155;">Перевозчик: <strong>${escapeEmailHtml(carrier?.name || 'Не указан')}</strong></div>
                        ${carrier?.phone ? `<div style="margin-top: 6px; color: #334155;">Телефон: <strong>${escapeEmailHtml(carrier.phone)}</strong></div>` : ''}
                        ${offer?.pickupDate ? `<div style="margin-top: 6px; color: #334155;">Дата подачи: <strong>${escapeEmailHtml(offer.pickupDate)}</strong></div>` : ''}
                        ${offer?.truckType ? `<div style="margin-top: 6px; color: #334155;">Транспорт: <strong>${escapeEmailHtml(offer.truckType)}</strong></div>` : ''}
                    </div>

                    ${offer?.comment ? `
                        <div style="border-left: 4px solid #2f80ed; padding: 10px 0 10px 14px; margin-bottom: 16px; color: #334155;">
                            <strong>Комментарий:</strong> ${escapeEmailHtml(offer.comment)}
                        </div>
                    ` : ''}

                    <p style="margin: 0; color: #64748b; font-size: 13px;">Откройте RouteHub на сайте или в приложении, чтобы принять или отклонить ставку.</p>
                </div>
            </div>
        `,
    });
}

async function sendOfferAcceptedNotificationEmail({ carrierEmail, carrierName, ownerName, load, offer }) {
    if (!carrierEmail) {
        console.warn('Offer accepted email skipped: carrier has no email', { offerId: offer?.id, loadId: offer?.loadId });
        return;
    }

    const route = `${load?.from_location || 'Не указано'} → ${load?.to_location || 'Не указано'}`;
    const subject = `Вашу ставку приняли — RouteHub`;

    await sendEmail({
        to: carrierEmail,
        subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
                <div style="background: #081120; color: #ffffff; padding: 22px 24px; border-radius: 16px 16px 0 0;">
                    <h2 style="margin: 0; font-size: 24px;">Вашу ставку приняли</h2>
                    <p style="margin: 8px 0 0; color: #cbd5e1;">Можно открывать заказ в RouteHub и начинать работу.</p>
                </div>

                <div style="border: 1px solid #e2e8f0; border-top: 0; padding: 22px 24px; border-radius: 0 0 16px 16px;">
                    <p style="margin: 0 0 16px;">Здравствуйте${carrierName ? `, ${escapeEmailHtml(carrierName)}` : ''}!</p>

                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; padding: 16px; margin-bottom: 16px;">
                        <div style="font-size: 13px; color: #15803d; margin-bottom: 6px;">Принятая ставка</div>
                        <div style="font-size: 24px; font-weight: 900; color: #15803d;">${formatEmailMoney(offer?.price, offer?.currency || 'KZT')}</div>
                    </div>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; margin-bottom: 16px;">
                        <div style="font-size: 13px; color: #64748b; margin-bottom: 6px;">Груз</div>
                        <div style="font-size: 18px; font-weight: 800; margin-bottom: 8px;">${escapeEmailHtml(load?.type || 'Груз')}</div>
                        <div style="font-size: 15px; font-weight: 700;">${escapeEmailHtml(route)}</div>
                        ${ownerName ? `<div style="margin-top: 10px; color: #334155;">Грузовладелец: <strong>${escapeEmailHtml(ownerName)}</strong></div>` : ''}
                    </div>

                    ${offer?.pickupDate ? `<p style="margin: 0 0 8px; color: #334155;">Дата подачи: <strong>${escapeEmailHtml(offer.pickupDate)}</strong></p>` : ''}
                    ${offer?.truckType ? `<p style="margin: 0 0 8px; color: #334155;">Транспорт: <strong>${escapeEmailHtml(offer.truckType)}</strong></p>` : ''}
                    ${offer?.comment ? `<p style="margin: 12px 0 0; color: #334155;"><strong>Комментарий:</strong> ${escapeEmailHtml(offer.comment)}</p>` : ''}

                    <p style="margin: 18px 0 0; color: #64748b; font-size: 13px;">Откройте RouteHub на сайте или в приложении, чтобы посмотреть детали заказа.</p>
                </div>
            </div>
        `,
    });
}
const DEFAULT_SESSION_SECRET = 'super-secret-key';
const DEFAULT_MOBILE_JWT_SECRET = 'routehub-mobile-secret-change-this';
const isProduction = process.env.NODE_ENV === 'production';

function isEnvEnabled(value) {
    return /^(1|true|yes)$/i.test(String(value || '').trim());
}

function isEnvDisabled(value) {
    return /^(0|false|no)$/i.test(String(value || '').trim());
}

function resolveSecret(name, fallback) {
    const value = process.env[name] || fallback;
    if (isProduction && value === fallback) {
        console.warn(`SECURITY WARNING: ${name} uses a default fallback. Set a strong value in production.`);
    }
    return value;
}

const app = express();

if (isProduction || isEnvEnabled(process.env.TRUST_PROXY)) {
    app.set('trust proxy', 1);
}

const SESSION_SECRET = resolveSecret('SESSION_SECRET', DEFAULT_SESSION_SECRET);
const MOBILE_JWT_SECRET = resolveSecret('MOBILE_JWT_SECRET', DEFAULT_MOBILE_JWT_SECRET);

const pool = new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'routehub',
    max: 20,
    idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err);
});

async function query(text, params = []) {
    return pool.query(text, params);
}

async function getOne(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows[0] || null;
}

async function getMany(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows;
}

const LOAD_LIMITS = {
    minPrice: 1000,
    maxPrice: 100000000,
    minWeight: 0.1,
    maxWeight: 100,
    maxVolume: 300,
    maxLength: 30,
    maxWidth: 4,
    maxHeight: 4,
    maxDescription: 500
};

function normalizeLoadText(value, maxLength = 120) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function parseLoadNumber(value) {
    const numeric = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(numeric) ? numeric : NaN;
}

function parseOptionalLoadNumber(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    return parseLoadNumber(raw);
}

function formatLoadLimit(value) {
    return Number(value).toLocaleString('ru-RU');
}

function getLoadLimitVerb(label) {
    return ['Ставка', 'Длина', 'Ширина', 'Высота'].includes(label) ? 'должна быть' : 'должен быть';
}

function validateRequiredLoadNumber(value, label, min, max, unit = '') {
    const numeric = parseLoadNumber(value);
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
        return {
            ok: false,
            error: label + ' ' + getLoadLimitVerb(label) + ' от ' + formatLoadLimit(min) + ' до ' + formatLoadLimit(max) + (unit ? ' ' + unit : '')
        };
    }

    return { ok: true, value: numeric };
}

function validateOptionalLoadNumber(value, label, max, unit = '') {
    const numeric = parseOptionalLoadNumber(value);
    if (numeric === null) return { ok: true, value: null };

    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > max) {
        return {
            ok: false,
            error: label + ' ' + getLoadLimitVerb(label) + ' больше 0 и не больше ' + formatLoadLimit(max) + (unit ? ' ' + unit : '')
        };
    }

    return { ok: true, value: numeric };
}

function validateLoadPayload(body = {}) {
    const fromLocation = normalizeLoadText(body.from_location, 80);
    const toLocation = normalizeLoadText(body.to_location, 80);
    const readyDate = normalizeLoadText(body.ready_date, 20);

    if (!fromLocation || !toLocation) {
        return { ok: false, error: 'Заполни Откуда и Куда' };
    }

    if (!readyDate) {
        return { ok: false, error: 'Выбери дату готовности к погрузке' };
    }

    const weight = validateRequiredLoadNumber(body.weight, 'Вес', LOAD_LIMITS.minWeight, LOAD_LIMITS.maxWeight, 'т');
    if (!weight.ok) return weight;

    const price = validateRequiredLoadNumber(body.price, 'Ставка', LOAD_LIMITS.minPrice, LOAD_LIMITS.maxPrice, '₸');
    if (!price.ok) return price;

    const volume = validateOptionalLoadNumber(body.volume, 'Объём', LOAD_LIMITS.maxVolume, 'м³');
    if (!volume.ok) return volume;

    const length = validateOptionalLoadNumber(body.length, 'Длина', LOAD_LIMITS.maxLength, 'м');
    if (!length.ok) return length;

    const width = validateOptionalLoadNumber(body.width, 'Ширина', LOAD_LIMITS.maxWidth, 'м');
    if (!width.ok) return width;

    const height = validateOptionalLoadNumber(body.height, 'Высота', LOAD_LIMITS.maxHeight, 'м');
    if (!height.ok) return height;

    return {
        ok: true,
        value: {
            from_location: fromLocation,
            to_location: toLocation,
            ready_date: readyDate,
            weight: weight.value,
            type: normalizeLoadText(body.type, 60),
            price: price.value,
            lat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : 0,
            lng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : 0,
            volume: volume.value,
            length: length.value,
            width: width.value,
            height: height.value,
            loading_type: normalizeLoadText(body.loading_type, 60),
            description: normalizeLoadText(body.description, LOAD_LIMITS.maxDescription)
        }
    };
}

const PUSH_CHANNELS = Object.freeze({
    default: 'routehub_default',
    messages: 'messages'
});

function normalizePushData(data = {}) {
    const normalized = {};
    for (const [key, value] of Object.entries(data || {})) {
        if (value === undefined || value === null) continue;
        normalized[key] = typeof value === 'string' ? value : String(value);
    }
    return normalized;
}

function makeLoadRouteText(load = {}) {
    const from = String(load.from_location || load.fromLocation || '').trim();
    const to = String(load.to_location || load.toLocation || '').trim();
    if (from && to) return from + ' -> ' + to;
    return from || to || '';
}

function makePriceText(price, currency = 'KZT') {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return '';
    return numericPrice.toLocaleString('ru-RU') + ' ' + (currency || 'KZT');
}

function makeOfferPushBody(load = {}, carrier = {}, price, currency) {
    const carrierName = String(carrier.name || '').trim() || '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a';
    const priceText = makePriceText(price, currency);
    const routeText = makeLoadRouteText(load);
    return carrierName
        + ' \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u043b \u0441\u0442\u0430\u0432\u043a\u0443'
        + (priceText ? ' ' + priceText : '')
        + (routeText ? '. ' + routeText : '');
}

function makeLoadStatusPushBody(load = {}, fallback = '\u0421\u0442\u0430\u0442\u0443\u0441 \u0433\u0440\u0443\u0437\u0430 \u0438\u0437\u043c\u0435\u043d\u0435\u043d') {
    const routeText = makeLoadRouteText(load);
    return fallback + (routeText ? ': ' + routeText : '');
}
function isExpoPushToken(token) {
    return typeof token === 'string' && /^ExponentPushToken\[[^\]]+\]$/.test(token);
}

async function sendExpoPushNotifications(userIds = [], { title, body, data } = {}) {
    const uniqueUserIds = [...new Set(
        (Array.isArray(userIds) ? userIds : [])
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id))
    )];

    if (!uniqueUserIds.length || !body) {
        return;
    }

    try {
        const tokenRows = await getMany(
            `SELECT push_tokens.id, push_tokens.token, push_tokens.platform
             FROM push_tokens
             JOIN users ON users.id = push_tokens."userId"
             WHERE push_tokens."userId" = ANY($1::bigint[])
               AND COALESCE(users.push_notifications, true) = true`,
            [uniqueUserIds]
        );

        const validTokens = tokenRows
            .map((row) => row.token)
            .filter(isExpoPushToken);

        if (!validTokens.length) {
            return;
        }

        const normalizedData = normalizePushData(data);
        const channelId = normalizedData.type === 'chat_message'
            ? PUSH_CHANNELS.messages
            : PUSH_CHANNELS.default;

        const messages = validTokens.map((to) => ({
            to,
            sound: 'default',
            title: title || 'RouteHub',
            body,
            data: normalizedData,
            channelId,
            priority: 'high',
            ttl: 60 * 60 * 24 * 14
        }));

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(messages)
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            console.error('Expo push HTTP error:', response.status, JSON.stringify(payload || {}).slice(0, 500));
        }

        const ticketResults = Array.isArray(payload?.data) ? payload.data : [];
        const invalidTokens = [];

        ticketResults.forEach((item, index) => {
            if (item?.status === 'error' && item?.details?.error === 'DeviceNotRegistered') {
                invalidTokens.push(validTokens[index]);
            } else if (item?.status === 'error') {
                console.error('Expo push ticket error:', item?.message || item?.details?.error || 'unknown');
            }
        });

        if (invalidTokens.length) {
            await query(
                'DELETE FROM push_tokens WHERE token = ANY($1::text[])',
                [invalidTokens]
            );
        }
    } catch (err) {
        console.error('Expo push error:', err.message);
    }
}

function isUniqueViolation(err) {
    return err && (err.code === '23505' || String(err.message || '').includes('duplicate key value'));
}

function normalizePhone(phone) {
    return String(phone || '').replace(/[^+\d]/g, '');
}
function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function isValidPassword(password) {
    return typeof password === 'string' && password.length >= 6;
}

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyCC1h97K_Q_IW8S5rvoCVZbnSGDNDrEKqU';

async function verifyFirebasePhoneToken(idToken, expectedPhone) {
    const requestedPhone = normalizePhone(expectedPhone || '');

    if (!idToken) {
        return { ok: false, error: 'Подтверди номер телефона' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
            signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { ok: false, error: data?.error?.message || 'Не удалось проверить Firebase token' };
        }

        const firebasePhone = normalizePhone(data?.users?.[0]?.phoneNumber || '');
        if (!firebasePhone || firebasePhone !== requestedPhone) {
            return { ok: false, error: 'Подтвержденный номер не совпадает' };
        }

        return { ok: true, phone: firebasePhone, uid: data.users[0].localId };
    } catch (error) {
        return { ok: false, error: 'Не удалось проверить номер телефона' };
    } finally {
        clearTimeout(timeoutId);
    }
}
async function assignUserCode(userId) {
    const row = await getOne(`
        UPDATE users
        SET user_code = LPAD((
            SELECT (COALESCE(MAX(NULLIF(user_code, '')::int), 0) + 1)::text
            FROM users
            WHERE id <> $1
        ), 6, '0')
        WHERE id = $1 AND (user_code IS NULL OR user_code = '')
        RETURNING user_code
    `, [userId]);

    if (row?.user_code) return row.user_code;

    const existing = await getOne('SELECT user_code FROM users WHERE id = $1', [userId]);
    return existing?.user_code || String(userId).padStart(6, '0');
}
async function initDb() {
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            phone TEXT,
            company TEXT,
            role TEXT DEFAULT 'client',
            person_type TEXT DEFAULT 'individual',
            user_code TEXT,
            ecp_verified BOOLEAN DEFAULT false,
            address TEXT,
            iin TEXT,
            registration_certificate_file TEXT,
            push_notifications BOOLEAN DEFAULT true,
            email_notifications BOOLEAN DEFAULT false,
            dark_theme BOOLEAN DEFAULT false
        )
    `);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code TEXT`);
    await query(`
        WITH numbered AS (
            SELECT id, LPAD(ROW_NUMBER() OVER (ORDER BY id)::text, 6, '0') AS code
            FROM users
            WHERE user_code IS NULL OR user_code = ''
        )
        UPDATE users
        SET user_code = numbered.code
        FROM numbered
        WHERE users.id = numbered.id
    `);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_code ON users (user_code)`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ecp_verified BOOLEAN DEFAULT false`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS iin TEXT`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_certificate_file TEXT`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT true`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT false`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dark_theme BOOLEAN DEFAULT false`);

    await query(`
        CREATE TABLE IF NOT EXISTS loads (
            id BIGSERIAL PRIMARY KEY,
            "userId" BIGINT REFERENCES users(id) ON DELETE CASCADE,
            from_location TEXT,
            to_location TEXT,
            weight DOUBLE PRECISION,
            type TEXT,
            price DOUBLE PRECISION,
            date TEXT,
            lat DOUBLE PRECISION,
            lng DOUBLE PRECISION,
            contact_info TEXT,
            volume DOUBLE PRECISION,
            length DOUBLE PRECISION,
            width DOUBLE PRECISION,
            height DOUBLE PRECISION,
            loading_type TEXT,
            description TEXT,
            status TEXT DEFAULT 'open',
            "clientCompleted" BOOLEAN DEFAULT false,
            "carrierCompleted" BOOLEAN DEFAULT false,
            "clientCompletedAt" TIMESTAMP NULL,
            "carrierCompletedAt" TIMESTAMP NULL
        )
    `);

    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS volume DOUBLE PRECISION`);
    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS length DOUBLE PRECISION`);
    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS width DOUBLE PRECISION`);
    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS height DOUBLE PRECISION`);
    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS loading_type TEXT`);
    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS description TEXT`);
    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open'`);
    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS "clientCompleted" BOOLEAN DEFAULT false`);
    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS "carrierCompleted" BOOLEAN DEFAULT false`);
    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS "clientCompletedAt" TIMESTAMP NULL`);
    await query(`ALTER TABLE loads ADD COLUMN IF NOT EXISTS "carrierCompletedAt" TIMESTAMP NULL`);

    await query(`
        CREATE TABLE IF NOT EXISTS offers (
            id BIGSERIAL PRIMARY KEY,
            "loadId" BIGINT NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
            "carrierUserId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            "carrierName" TEXT,
            "carrierPhone" TEXT,
            price DOUBLE PRECISION,
            currency TEXT DEFAULT 'KZT',
            "pickupDate" TEXT,
            "truckType" TEXT,
            comment TEXT,
            status TEXT DEFAULT 'pending',
            initiator TEXT DEFAULT 'carrier',
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS favorites (
            id BIGSERIAL PRIMARY KEY,
            "userId" BIGINT REFERENCES users(id) ON DELETE CASCADE,
            "loadId" BIGINT REFERENCES loads(id) ON DELETE CASCADE,
            UNIQUE ("userId", "loadId")
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS password_resets (
            id BIGSERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT false
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS registration_email_codes (
            id BIGSERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_registration_email_codes_email ON registration_email_codes (email)`);


    await query(`
        CREATE TABLE IF NOT EXISTS chats (
            id BIGSERIAL PRIMARY KEY,
            "loadId" BIGINT REFERENCES loads(id) ON DELETE CASCADE,
            "clientId" BIGINT REFERENCES users(id) ON DELETE CASCADE,
            "carrierId" BIGINT REFERENCES users(id) ON DELETE CASCADE,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE ("loadId", "carrierId")
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS messages (
            id BIGSERIAL PRIMARY KEY,
            "chatId" BIGINT REFERENCES chats(id) ON DELETE CASCADE,
            "senderId" BIGINT REFERENCES users(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS global_messages (
            id BIGSERIAL PRIMARY KEY,
            "senderId" BIGINT REFERENCES users(id) ON DELETE SET NULL,
            text TEXT NOT NULL,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS push_tokens (
            id BIGSERIAL PRIMARY KEY,
            "userId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token TEXT NOT NULL UNIQUE,
            platform TEXT,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages ("chatId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_global_messages_created_at ON global_messages ("createdAt")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_loads_user_id ON loads ("userId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_offers_load_id ON offers ("loadId")`);
    await query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS initiator TEXT DEFAULT 'carrier'`);
    await query(`CREATE INDEX IF NOT EXISTS idx_offers_initiator ON offers (initiator)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_offers_carrier_user_id ON offers ("carrierUserId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites ("userId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens ("userId")`);
    await query(`
        CREATE TABLE IF NOT EXISTS carrier_locations (
            id BIGSERIAL PRIMARY KEY,
            "loadId" BIGINT NOT NULL UNIQUE REFERENCES loads(id) ON DELETE CASCADE,
            "carrierUserId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            accuracy DOUBLE PRECISION,
            heading DOUBLE PRECISION,
            speed DOUBLE PRECISION,
            "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_carrier_locations_carrier_id ON carrier_locations ("carrierUserId")`);
    await query(`
        CREATE TABLE IF NOT EXISTS wallets (
            id BIGSERIAL PRIMARY KEY,
            "userId" BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            balance NUMERIC(14,2) NOT NULL DEFAULT 0,
            "heldBalance" NUMERIC(14,2) NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'KZT',
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS wallet_topup_requests (
            id BIGSERIAL PRIMARY KEY,
            "userId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount NUMERIC(14,2) NOT NULL,
            currency TEXT NOT NULL DEFAULT 'KZT',
            status TEXT NOT NULL DEFAULT 'pending',
            "receiptFile" TEXT,
            "receiptOriginalName" TEXT,
            "adminComment" TEXT DEFAULT '',
            "reviewedBy" BIGINT REFERENCES users(id) ON DELETE SET NULL,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            "reviewedAt" TIMESTAMP NULL
        )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_user_id ON wallet_topup_requests ("userId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_status ON wallet_topup_requests (status)`);

    await query(`
        CREATE TABLE IF NOT EXISTS wallet_withdraw_requests (
            id BIGSERIAL PRIMARY KEY,
            "userId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount NUMERIC(14,2) NOT NULL,
            currency TEXT NOT NULL DEFAULT 'KZT',
            status TEXT NOT NULL DEFAULT 'pending',
            "payoutDetails" TEXT NOT NULL,
            "adminComment" TEXT DEFAULT '',
            "reviewedBy" BIGINT REFERENCES users(id) ON DELETE SET NULL,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            "reviewedAt" TIMESTAMP NULL
        )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_wallet_withdraw_requests_user_id ON wallet_withdraw_requests ("userId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_wallet_withdraw_requests_status ON wallet_withdraw_requests (status)`);
    await query(`
        CREATE TABLE IF NOT EXISTS wallet_transactions (
            id BIGSERIAL PRIMARY KEY,
            "userId" BIGINT REFERENCES users(id) ON DELETE SET NULL,
            "loadId" BIGINT REFERENCES loads(id) ON DELETE SET NULL,
            "offerId" BIGINT REFERENCES offers(id) ON DELETE SET NULL,
            "escrowId" BIGINT,
            type TEXT NOT NULL,
            amount NUMERIC(14,2) NOT NULL,
            currency TEXT NOT NULL DEFAULT 'KZT',
            status TEXT NOT NULL DEFAULT 'completed',
            description TEXT DEFAULT '',
            "providerPaymentId" TEXT,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS escrows (
            id BIGSERIAL PRIMARY KEY,
            "loadId" BIGINT NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
            "offerId" BIGINT NOT NULL UNIQUE REFERENCES offers(id) ON DELETE CASCADE,
            "ownerUserId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            "carrierUserId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount NUMERIC(14,2) NOT NULL,
            "commissionAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
            "carrierAmount" NUMERIC(14,2) NOT NULL,
            currency TEXT NOT NULL DEFAULT 'KZT',
            status TEXT NOT NULL DEFAULT 'held',
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            "releasedAt" TIMESTAMP NULL,
            "refundedAt" TIMESTAMP NULL
        )
    `);

    await query(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS "escrowId" BIGINT`);
    await query(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT`);
    await query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions ("userId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_escrow_id ON wallet_transactions ("escrowId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_escrows_load_id ON escrows ("loadId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows (status)`);


await query(`
    CREATE TABLE IF NOT EXISTS reviews (
        id BIGSERIAL PRIMARY KEY,
        "reviewerId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "revieweeId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "loadId" BIGINT NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        text TEXT DEFAULT '',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("reviewerId", "loadId")  -- один отзыв на один груз
    )
`);

await query(`CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews ("revieweeId")`);
}


app.disable('x-powered-by');

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
}));

const allowedCorsOrigins = new Set([
    'https://routehubkz.com',
    'https://www.routehubkz.com',
    'http://routehubkz.com',
    'http://www.routehubkz.com',
    'http://localhost:8081',
    'http://localhost:19006',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:19006'
]);

function isAllowedCorsOrigin(origin) {
    return allowedCorsOrigins.has(origin) || /^http:\/\/(localhost|127\\.0\\.0\\.1|10(?:\\.\\d{1,3}){3}|172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2}|192\\.168(?:\\.\\d{1,3}){2})(?::\\d+)?$/.test(origin);
}

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedCorsOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});
app.use((req, res, next) => {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

    if (isProduction && isHttps) {
        res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }

    if (req.path.startsWith('/api/admin') || ['/admin.html', '/admin.css', '/admin.js'].includes(req.path)) {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(self)');
    next();
});

app.use(express.json({ limit: '60mb' }));
app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: '\u0424\u0430\u0439\u043b \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u0438 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u043e\u0439. \u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0444\u0430\u0439\u043b \u0434\u043e 10 MB' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ error: '\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u0437\u0430\u043f\u0440\u043e\u0441\u0430' });
    }
    next(err);
});

app.use(session({
    store: new PgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction && !isEnvDisabled(process.env.COOKIE_SECURE)
    }
}));

app.get('/admin', (req, res) => res.redirect(302, '/admin.html'));

function getPublicBaseUrl(req) {
    const configured = process.env.SITE_URL || process.env.PUBLIC_URL || process.env.BASE_URL;
    if (configured) return configured.replace(/\/+$/, '');

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    return `${proto}://${req.get('host')}`;
}

app.get('/robots.txt', (req, res) => {
    const baseUrl = getPublicBaseUrl(req);
    res.type('text/plain').send([
        'User-agent: *',
        'Allow: /',
        '',
        'Disallow: /admin',
        'Disallow: /admin.html',
        'Disallow: /api/admin/',
        '',
        `Sitemap: ${baseUrl}/sitemap.xml`,
        ''
    ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
    const baseUrl = getPublicBaseUrl(req);
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
        ['/', '1.0'],
        ['/about(test)/about.html', '0.6'],
        ['/page2/index2.html', '0.9'],
        ['/mape/map.html', '0.75'],
        ['/newspage/index.html', '0.5'],
        ['/privacy.html', '0.3'],
        ['/terms.html', '0.3']
    ];

    const body = urls.map(([loc, priority]) => [
        '  <url>',
        `    <loc>${baseUrl}${loc}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        `    <priority>${priority}</priority>`,
        '  </url>'
    ].join('\n')).join('\n');

    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
});

app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (/\.(?:html|css|js|mjs|json|xml|txt)$/i.test(filePath)) {
            const currentType = res.getHeader('Content-Type');
            if (currentType && !String(currentType).toLowerCase().includes('charset=')) {
                res.setHeader('Content-Type', String(currentType) + '; charset=utf-8');
            }
        }
    }
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function checkAuth(req, res, next) {
    if (req.session.userId) next();
    else res.status(401).json({ error: 'Необходима авторизация' });
}

const DEFAULT_ADMIN_PASSWORD = 'routehub-admin-2026';

function getAdminPassword() {
    return process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || DEFAULT_ADMIN_PASSWORD;
}

if (isProduction && getAdminPassword() === DEFAULT_ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH) {
    console.warn('SECURITY WARNING: ADMIN_PASSWORD is using the default fallback. Set ADMIN_PASSWORD_HASH or ADMIN_PASSWORD in production.');
}

function getAdminEmails() {
    return String(process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

async function checkAdmin(req, res, next) {
    if (req.session?.isAdmin) return next();

    const adminEmails = getAdminEmails();
    if (req.session?.userId && adminEmails.length) {
        try {
            const user = await getOne('SELECT email FROM users WHERE id = $1', [req.session.userId]);
            if (user?.email && adminEmails.includes(String(user.email).toLowerCase())) {
                req.session.isAdmin = true;
                return next();
            }
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(401).json({ error: 'Admin access required' });
}

const ADMIN_LOGIN_WINDOW_MS = Number(process.env.ADMIN_LOGIN_WINDOW_MS || 15 * 60 * 1000);
const ADMIN_LOGIN_MAX_ATTEMPTS = Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || 8);
const adminLoginAttempts = new Map();

function getAdminLoginKey(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function pruneAdminLoginAttempts(now = Date.now()) {
    for (const [key, entry] of adminLoginAttempts.entries()) {
        if (!entry?.blockedUntil && now - entry.firstAttemptAt > ADMIN_LOGIN_WINDOW_MS) {
            adminLoginAttempts.delete(key);
        }
        if (entry?.blockedUntil && entry.blockedUntil <= now) {
            adminLoginAttempts.delete(key);
        }
    }
}

function checkAdminLoginThrottle(req, res, next) {
    const now = Date.now();
    pruneAdminLoginAttempts(now);

    const entry = adminLoginAttempts.get(getAdminLoginKey(req));
    if (entry?.blockedUntil && entry.blockedUntil > now) {
        const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ error: 'Too many admin login attempts. Try again later.' });
    }

    return next();
}

function recordAdminLoginFailure(req) {
    const now = Date.now();
    const key = getAdminLoginKey(req);
    const current = adminLoginAttempts.get(key);
    const entry = current && now - current.firstAttemptAt <= ADMIN_LOGIN_WINDOW_MS
        ? current
        : { count: 0, firstAttemptAt: now, blockedUntil: 0 };

    entry.count += 1;
    if (entry.count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
        entry.blockedUntil = now + ADMIN_LOGIN_WINDOW_MS;
    }

    adminLoginAttempts.set(key, entry);
}

function clearAdminLoginAttempts(req) {
    adminLoginAttempts.delete(getAdminLoginKey(req));
}

function getAdminLoadSelectSql() {
    return `
        SELECT
            loads.*,
            owner.id AS "ownerId",
            owner.name AS "ownerName",
            owner.email AS "ownerEmail",
            owner.phone AS "ownerPhone",
            owner.company AS "ownerCompany",
            owner.role AS "ownerRole",
            owner.person_type AS "ownerPersonType",
            owner.user_code AS "ownerCode",
            owner.ecp_verified AS "ownerEcpVerified",
            accepted.id AS "acceptedOfferId",
            accepted.price AS "acceptedOfferPrice",
            accepted.currency AS "acceptedOfferCurrency",
            accepted."carrierUserId" AS "acceptedCarrierUserId",
            accepted."carrierName" AS "acceptedCarrierName",
            accepted."carrierPhone" AS "acceptedCarrierPhone",
            carrier.name AS "carrierName",
            carrier.email AS "carrierEmail",
            carrier.phone AS "carrierPhone",
            carrier.company AS "carrierCompany",
            carrier.role AS "carrierRole",
            carrier.person_type AS "carrierPersonType",
            carrier.user_code AS "carrierCode",
            COALESCE(offer_counts.total, 0)::int AS "offerCount",
            COALESCE(offer_counts.pending, 0)::int AS "pendingOfferCount",
            latest_escrow.id AS "escrowId",
            latest_escrow.status AS "escrowStatus",
            latest_escrow.amount AS "escrowAmount",
            latest_escrow."carrierAmount" AS "escrowCarrierAmount",
            latest_escrow."commissionAmount" AS "escrowCommissionAmount"
        FROM loads
        LEFT JOIN users owner ON owner.id = loads."userId"
        LEFT JOIN offers accepted
            ON accepted."loadId" = loads.id
           AND accepted.status = 'accepted'
        LEFT JOIN users carrier ON carrier.id = accepted."carrierUserId"
        LEFT JOIN (
            SELECT
                "loadId",
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'pending') AS pending
            FROM offers
            GROUP BY "loadId"
        ) offer_counts ON offer_counts."loadId" = loads.id
        LEFT JOIN LATERAL (
            SELECT *
            FROM escrows
            WHERE escrows."loadId" = loads.id
            ORDER BY escrows.id DESC
            LIMIT 1
        ) latest_escrow ON true
    `;
}

async function getAdminLoad(loadId) {
    return getOne(`${getAdminLoadSelectSql()} WHERE loads.id = $1`, [loadId]);
}

async function getAdminLoadOffers(loadId) {
    return getMany(`
        SELECT
            offers.*,
            carrier.id AS "carrierId",
            carrier.name AS "carrierUserName",
            carrier.email AS "carrierEmail",
            carrier.phone AS "carrierUserPhone",
            carrier.company AS "carrierCompany",
            carrier.role AS "carrierRole",
            carrier.person_type AS "carrierPersonType",
            carrier.user_code AS "carrierCode",
            carrier.ecp_verified AS "carrierEcpVerified"
        FROM offers
        LEFT JOIN users carrier ON carrier.id = offers."carrierUserId"
        WHERE offers."loadId" = $1
        ORDER BY
            CASE offers.status
                WHEN 'accepted' THEN 0
                WHEN 'pending' THEN 1
                WHEN 'rejected' THEN 2
                ELSE 3
            END,
            offers.id DESC
    `, [loadId]);
}

async function cancelCarrierPendingOffersAfterAcceptance(client, { carrierUserId, acceptedOfferId, acceptedLoadId }) {
    if (!carrierUserId) return [];

    const result = await client.query(
        `UPDATE offers
         SET status = 'rejected'
         WHERE "carrierUserId" = $1
           AND status = 'pending'
           AND id <> $2
           AND "loadId" <> $3
         RETURNING id, "loadId"`,
        [carrierUserId, acceptedOfferId, acceptedLoadId]
    );

    return result.rows;
}
async function acceptOfferAsAdmin(client, offerId) {
    const offerResult = await client.query('SELECT * FROM offers WHERE id = $1 FOR UPDATE', [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) {
        const error = new Error('Ставка не найдена');
        error.statusCode = 404;
        throw error;
    }

    const loadResult = await client.query('SELECT * FROM loads WHERE id = $1 FOR UPDATE', [offer.loadId]);
    const load = loadResult.rows[0];
    if (!load) {
        const error = new Error('Груз не найден');
        error.statusCode = 404;
        throw error;
    }

    await refundEscrowForLoad(client, load.id, 'Админ снял предыдущее назначение');
    await holdEscrowForAcceptedOffer(client, { load, offer, ownerId: load.userId });

    await client.query(`UPDATE offers SET status = 'rejected' WHERE "loadId" = $1 AND id <> $2`, [load.id, offerId]);
    await client.query(`UPDATE offers SET status = 'accepted' WHERE id = $1`, [offerId]);
        await cancelCarrierPendingOffersAfterAcceptance(client, {
            carrierUserId: offer.carrierUserId,
            acceptedOfferId: offerId,
            acceptedLoadId: offer.loadId
        });
    await client.query(
        `UPDATE loads
         SET status = 'assigned',
             "clientCompleted" = false,
             "carrierCompleted" = false,
             "clientCompletedAt" = NULL,
             "carrierCompletedAt" = NULL
         WHERE id = $1`,
        [load.id]
    );

    return { loadId: load.id, offerId: offer.id };
}
function getLoadCompletionState(load, currentUserId, acceptedCarrierId = null) {
    const ownerId = Number(load?.userId);
    const actorId = Number(currentUserId);
    const carrierId = acceptedCarrierId !== null && acceptedCarrierId !== undefined
        ? Number(acceptedCarrierId)
        : null;

    const clientCompleted = Boolean(load?.clientCompleted);
    const carrierCompleted = Boolean(load?.carrierCompleted);
    const isOwner = Number.isFinite(ownerId) && ownerId === actorId;
    const isCarrier = Number.isFinite(carrierId) && carrierId === actorId;

    return {
        clientCompleted,
        carrierCompleted,
        waitingForClient: !clientCompleted,
        waitingForCarrier: !carrierCompleted,
        actorSide: isOwner ? 'client' : isCarrier ? 'carrier' : null,
        actorCompleted: isOwner ? clientCompleted : isCarrier ? carrierCompleted : false,
        isFullyCompleted: clientCompleted && carrierCompleted
    };
}

const PLATFORM_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE || 0.05);

function toMoney(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 100) / 100;
}

function calculateEscrowAmounts(amount) {
    const safeAmount = toMoney(amount);
    const safeRate = Number.isFinite(PLATFORM_COMMISSION_RATE) && PLATFORM_COMMISSION_RATE >= 0
        ? PLATFORM_COMMISSION_RATE
        : 0;
    const commissionAmount = toMoney(safeAmount * safeRate);
    return {
        amount: safeAmount,
        commissionAmount,
        carrierAmount: toMoney(safeAmount - commissionAmount)
    };
}

async function ensureWallet(db, userId, { lock = false } = {}) {
    await db.query(
        `INSERT INTO wallets ("userId") VALUES ($1) ON CONFLICT ("userId") DO NOTHING`,
        [userId]
    );

    const result = await db.query(
        `SELECT * FROM wallets WHERE "userId" = $1${lock ? ' FOR UPDATE' : ''}`,
        [userId]
    );

    return result.rows[0];
}

async function addWalletTransaction(db, { userId, loadId = null, offerId = null, escrowId = null, type, amount, currency = 'KZT', description = '', providerPaymentId = null }) {
    await db.query(
        `INSERT INTO wallet_transactions ("userId", "loadId", "offerId", "escrowId", type, amount, currency, status, description, "providerPaymentId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9)`,
        [userId, loadId, offerId, escrowId, type, toMoney(amount), currency, description, providerPaymentId]
    );
}

async function getWalletPayload(userId) {
    const db = pool;
    const wallet = await ensureWallet(db, userId);
    const transactions = await getMany(
        `SELECT id, type, amount, currency, status, description, "loadId", "offerId", "createdAt"
         FROM wallet_transactions
         WHERE "userId" = $1
         ORDER BY id DESC
         LIMIT 20`,
        [userId]
    );

    const topupRequests = await getMany(
        `SELECT id, amount::float AS amount, currency, status, "receiptFile", "receiptOriginalName", "adminComment", "createdAt", "reviewedAt"
         FROM wallet_topup_requests
         WHERE "userId" = $1
         ORDER BY id DESC
         LIMIT 10`,
        [userId]
    );
    const withdrawRequests = await getMany(
        `SELECT id, amount::float AS amount, currency, status, "payoutDetails", "adminComment", "createdAt", "reviewedAt"
         FROM wallet_withdraw_requests
         WHERE "userId" = $1
         ORDER BY id DESC
         LIMIT 10`,
        [userId]
    );

    return {
        balance: toMoney(wallet.balance),
        heldBalance: toMoney(wallet.heldBalance),
        availableBalance: toMoney(wallet.balance),
        currency: wallet.currency || 'KZT',
        transactions,
        topupRequests,
        withdrawRequests
    };
}

const TOPUP_PAYMENT_DETAILS = {
    title: 'RouteHub Logistics',
    bank: '\u041a\u0430\u0441\u043f\u0438 / \u0431\u0430\u043d\u043a\u043e\u0432\u0441\u043a\u0438\u0439 \u043f\u0435\u0440\u0435\u0432\u043e\u0434',
    account: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0440\u0435\u0430\u043b\u044c\u043d\u044b\u0435 \u0440\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b RouteHub \u0432 \u0430\u0434\u043c\u0438\u043d\u043a\u0435/\u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435',
    comment: '\u0412 \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0438 \u043a \u043f\u0435\u0440\u0435\u0432\u043e\u0434\u0443 \u0443\u043a\u0430\u0436\u0438\u0442\u0435 \u043a\u043e\u0434 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u0438\u043b\u0438 \u0442\u0435\u043b\u0435\u0444\u043e\u043d \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430'
};

function getTopupPaymentDetails() {
    return {
        title: process.env.TOPUP_RECEIVER_NAME || TOPUP_PAYMENT_DETAILS.title,
        bank: process.env.TOPUP_BANK_NAME || TOPUP_PAYMENT_DETAILS.bank,
        account: process.env.TOPUP_ACCOUNT || TOPUP_PAYMENT_DETAILS.account,
        comment: process.env.TOPUP_PAYMENT_COMMENT || TOPUP_PAYMENT_DETAILS.comment
    };
}

function parseDataUrlUpload(data) {
    const raw = String(data || '');
    const match = raw.match(/^data:([^;]+);base64,(.+)$/);
    if (match) return { mimeType: match[1], base64: match[2] };
    return { mimeType: '', base64: raw };
}

function sanitizeUploadName(name) {
    const ext = path.extname(String(name || '')).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    return allowed.includes(ext) ? ext : '.bin';
}

function saveTopupReceiptBuffer({ userId, fileName, buffer, mimeType }) {
    const effectiveMime = String(mimeType || 'application/octet-stream').toLowerCase();
    const allowedMime = effectiveMime.startsWith('image/') || effectiveMime === 'application/pdf' || effectiveMime === 'application/octet-stream';
    if (!allowedMime) {
        const error = new Error('\u041c\u043e\u0436\u043d\u043e \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0438\u043b\u0438 PDF');
        error.statusCode = 400;
        throw error;
    }
    if (!buffer?.length) {
        const error = new Error('\u0424\u0430\u0439\u043b \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u0438 \u043f\u0443\u0441\u0442\u043e\u0439');
        error.statusCode = 400;
        throw error;
    }
    if (buffer.length > 10 * 1024 * 1024) {
        const error = new Error('\u0424\u0430\u0439\u043b \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u0438 \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0434\u043e 10 MB');
        error.statusCode = 400;
        throw error;
    }

    const uploadDir = path.join(__dirname, 'uploads', 'wallet-topups');
    fs.mkdirSync(uploadDir, { recursive: true });
    const ext = sanitizeUploadName(fileName);
    const storedName = 'topup_' + userId + '_' + Date.now() + ext;
    const fullPath = path.join(uploadDir, storedName);
    fs.writeFileSync(fullPath, buffer);
    return '/uploads/wallet-topups/' + storedName;
}

function saveTopupReceipt({ userId, fileName, data, mimeType }) {
    const parsed = parseDataUrlUpload(data);
    return saveTopupReceiptBuffer({
        userId,
        fileName,
        mimeType: mimeType || parsed.mimeType,
        buffer: Buffer.from(parsed.base64, 'base64')
    });
}

function parseContentDisposition(value) {
    const output = {};
    String(value || '').split(';').forEach((part) => {
        const item = part.trim();
        const eq = item.indexOf('=');
        if (eq === -1) return;
        const key = item.slice(0, eq).trim().toLowerCase();
        let val = item.slice(eq + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        output[key] = val;
    });
    return output;
}

async function parseMultipartRequest(req, { maxBytes = 12 * 1024 * 1024 } = {}) {
    const contentType = String(req.headers['content-type'] || '');
    const boundary = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i)?.[2];
    if (!boundary) {
        const error = new Error('\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u0444\u0430\u0439\u043b \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u0438');
        error.statusCode = 400;
        throw error;
    }

    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        total += chunk.length;
        if (total > maxBytes) {
            const error = new Error('\u0424\u0430\u0439\u043b \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u0438 \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0434\u043e 10 MB');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }

    const body = Buffer.concat(chunks);
    const delimiter = Buffer.from('--' + boundary);
    const fields = {};
    const files = {};
    let pos = body.indexOf(delimiter);

    while (pos !== -1) {
        let partStart = pos + delimiter.length;
        if (body[partStart] === 45 && body[partStart + 1] === 45) break;
        if (body[partStart] === 13 && body[partStart + 1] === 10) partStart += 2;
        const next = body.indexOf(delimiter, partStart);
        if (next === -1) break;
        let partEnd = next;
        if (body[partEnd - 2] === 13 && body[partEnd - 1] === 10) partEnd -= 2;
        const part = body.subarray(partStart, partEnd);
        const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
        if (headerEnd !== -1) {
            const headerText = part.subarray(0, headerEnd).toString('latin1');
            const content = part.subarray(headerEnd + 4);
            const headers = {};
            headerText.split('\r\n').forEach((line) => {
                const idx = line.indexOf(':');
                if (idx !== -1) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
            });
            const disposition = parseContentDisposition(headers['content-disposition']);
            if (disposition.name) {
                if (disposition.filename !== undefined) {
                    files[disposition.name] = { buffer: content, fileName: disposition.filename || 'receipt', mimeType: headers['content-type'] || 'application/octet-stream' };
                } else {
                    fields[disposition.name] = content.toString('utf8');
                }
            }
        }
        pos = next;
    }

    return { fields, files };
}

async function createWalletTopupRequest(userId, body = {}) {
    const amount = toMoney(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
        const error = new Error('\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0441\u0443\u043c\u043c\u0443 \u043e\u0442 1 \u0434\u043e 100 000 000 \u20b8');
        error.statusCode = 400;
        throw error;
    }
    if (!body.receiptData) {
        const error = new Error('\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e \u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u0435');
        error.statusCode = 400;
        throw error;
    }

    const receiptOriginalName = String(body.fileName || 'receipt').slice(0, 180);
    const receiptFile = saveTopupReceipt({
        userId,
        fileName: receiptOriginalName,
        mimeType: body.mimeType,
        data: body.receiptData
    });

    const row = await getOne(
        `INSERT INTO wallet_topup_requests ("userId", amount, currency, status, "receiptFile", "receiptOriginalName")
         VALUES ($1, $2, 'KZT', 'pending', $3, $4)
         RETURNING id, amount::float AS amount, currency, status, "receiptFile", "receiptOriginalName", "createdAt"`,
        [userId, amount, receiptFile, receiptOriginalName]
    );

    return row;
}

async function sendWithdrawRequestEmail({ request, user }) {
    const to = process.env.WITHDRAW_NOTIFY_EMAIL || 'Turalievbaglan@gmail.com';
    await sendEmail({
        to,
        subject: '\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u044f\u0432\u043a\u0430 \u043d\u0430 \u0432\u044b\u0432\u043e\u0434 \u0441\u0440\u0435\u0434\u0441\u0442\u0432 RouteHub',
        text: '\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u044f\u0432\u043a\u0430 \u043d\u0430 \u0432\u044b\u0432\u043e\u0434: #' + request.id + ', ' + request.amount + ' KZT. \u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c: ' + (user.name || user.phone || user.email || user.id),
        html: '<div style="font-family:Arial,sans-serif;color:#0f172a"><h2>\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u044f\u0432\u043a\u0430 \u043d\u0430 \u0432\u044b\u0432\u043e\u0434</h2><p><b>\u0421\u0443\u043c\u043c\u0430:</b> ' + escapeEmailHtml(request.amount) + ' KZT</p><p><b>\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c:</b> ' + escapeEmailHtml(user.name || user.company || user.phone || user.email || user.id) + '</p><p><b>\u041a\u043e\u0434:</b> ' + escapeEmailHtml(user.user_code || '') + '</p><p><b>\u0420\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b:</b><br>' + escapeEmailHtml(request.payoutDetails).replace(/\n/g, '<br>') + '</p></div>'
    });
}

async function createWalletWithdrawRequest(userId, body = {}) {
    const amount = toMoney(body.amount);
    const payoutDetails = String(body.payoutDetails || '').trim();
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) { const error = new Error('\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0441\u0443\u043c\u043c\u0443 \u043e\u0442 1 \u0434\u043e 100 000 000 \u20b8'); error.statusCode = 400; throw error; }
    if (payoutDetails.length < 8) { const error = new Error('\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0440\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b \u0434\u043b\u044f \u0432\u044b\u0432\u043e\u0434\u0430'); error.statusCode = 400; throw error; }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userResult = await client.query('SELECT id, name, email, phone, company, user_code FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userResult.rows[0];
        if (!user) { await client.query('ROLLBACK'); const error = new Error('\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d'); error.statusCode = 404; throw error; }
        const wallet = await ensureWallet(client, userId, { lock: true });
        const currentBalance = toMoney(wallet.balance);
        if (currentBalance < amount) { await client.query('ROLLBACK'); const error = new Error('\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u0441\u0440\u0435\u0434\u0441\u0442\u0432 \u043d\u0430 \u0431\u0430\u043b\u0430\u043d\u0441\u0435'); error.statusCode = 400; error.wallet = { balance: currentBalance, required: amount }; throw error; }
        await client.query('UPDATE wallets SET balance = balance - $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2', [amount, userId]);
        const rowResult = await client.query('INSERT INTO wallet_withdraw_requests ("userId", amount, currency, status, "payoutDetails") VALUES ($1, $2, $3, $4, $5) RETURNING id, amount::float AS amount, currency, status, "payoutDetails", "createdAt"', [userId, amount, 'KZT', 'pending', payoutDetails]);
        const request = rowResult.rows[0];
        await addWalletTransaction(client, { userId, type: 'withdraw_pending', amount: -amount, currency: wallet.currency || 'KZT', description: '\u0417\u0430\u044f\u0432\u043a\u0430 \u043d\u0430 \u0432\u044b\u0432\u043e\u0434 #' + request.id, providerPaymentId: 'withdraw_request_' + request.id });
        await client.query('COMMIT');
        sendWithdrawRequestEmail({ request, user }).catch((err) => console.error('withdraw email error:', err));
        return request;
    } catch (err) { try { await client.query('ROLLBACK'); } catch (_) {} throw err; }
    finally { client.release(); }
}

async function holdEscrowForAcceptedOffer(db, { load, offer, ownerId }) {
    const { amount, commissionAmount, carrierAmount } = calculateEscrowAmounts(offer.price);
    if (amount <= 0) {
        const error = new Error('Сумма ставки должна быть больше 0');
        error.statusCode = 400;
        throw error;
    }

    const existingEscrow = await db.query(
        `SELECT * FROM escrows WHERE "loadId" = $1 AND status = 'held' FOR UPDATE`,
        [offer.loadId]
    );
    if (existingEscrow.rows[0]) {
        const error = new Error('По этому грузу уже есть замороженная оплата');
        error.statusCode = 400;
        throw error;
    }

    const ownerWallet = await ensureWallet(db, ownerId, { lock: true });
    const currentBalance = toMoney(ownerWallet.balance);
    if (currentBalance < amount) {
        const error = new Error(`Недостаточно средств. Нужно ${amount.toLocaleString('ru-RU')} ₸, доступно ${currentBalance.toLocaleString('ru-RU')} ₸`);
        error.statusCode = 402;
        error.wallet = { balance: currentBalance, required: amount };
        throw error;
    }

    await db.query(
        `UPDATE wallets
         SET balance = balance - $1,
             "heldBalance" = "heldBalance" + $1,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "userId" = $2`,
        [amount, ownerId]
    );

    const escrowResult = await db.query(
        `INSERT INTO escrows ("loadId", "offerId", "ownerUserId", "carrierUserId", amount, "commissionAmount", "carrierAmount", currency, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'held')
         RETURNING *`,
        [offer.loadId, offer.id, ownerId, offer.carrierUserId, amount, commissionAmount, carrierAmount, offer.currency || 'KZT']
    );
    const escrow = escrowResult.rows[0];

    await addWalletTransaction(db, {
        userId: ownerId,
        loadId: offer.loadId,
        offerId: offer.id,
        escrowId: escrow.id,
        type: 'hold',
        amount: -amount,
        currency: offer.currency || 'KZT',
        description: 'Заморозка оплаты за груз'
    });

    return escrow;
}

async function releaseEscrowForLoad(db, loadId) {
    const result = await db.query(
        `SELECT * FROM escrows WHERE "loadId" = $1 AND status = 'held' FOR UPDATE`,
        [loadId]
    );
    const escrow = result.rows[0];
    if (!escrow) return null;

    const amount = toMoney(escrow.amount);
    const carrierAmount = toMoney(escrow.carrierAmount);
    const commissionAmount = toMoney(escrow.commissionAmount);

    await ensureWallet(db, escrow.ownerUserId, { lock: true });
    await ensureWallet(db, escrow.carrierUserId, { lock: true });

    await db.query(
        `UPDATE wallets
         SET "heldBalance" = GREATEST("heldBalance" - $1, 0),
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "userId" = $2`,
        [amount, escrow.ownerUserId]
    );

    await db.query(
        `UPDATE wallets
         SET balance = balance + $1,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "userId" = $2`,
        [carrierAmount, escrow.carrierUserId]
    );

    await db.query(
        `UPDATE escrows SET status = 'released', "releasedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        [escrow.id]
    );

    await addWalletTransaction(db, {
        userId: escrow.carrierUserId,
        loadId: escrow.loadId,
        offerId: escrow.offerId,
        escrowId: escrow.id,
        type: 'release',
        amount: carrierAmount,
        currency: escrow.currency,
        description: 'Выплата за завершенный груз'
    });

    if (commissionAmount > 0) {
        await addWalletTransaction(db, {
            userId: escrow.ownerUserId,
            loadId: escrow.loadId,
            offerId: escrow.offerId,
            escrowId: escrow.id,
            type: 'commission',
            amount: -commissionAmount,
            currency: escrow.currency,
            description: 'Комиссия RouteHub'
        });
    }

    return { ...escrow, status: 'released' };
}

async function refundEscrowForLoad(db, loadId, description = 'Возврат замороженной оплаты') {
    const result = await db.query(
        `SELECT * FROM escrows WHERE "loadId" = $1 AND status = 'held' FOR UPDATE`,
        [loadId]
    );
    const escrow = result.rows[0];
    if (!escrow) return null;

    const amount = toMoney(escrow.amount);
    await ensureWallet(db, escrow.ownerUserId, { lock: true });

    await db.query(
        `UPDATE wallets
         SET balance = balance + $1,
             "heldBalance" = GREATEST("heldBalance" - $1, 0),
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "userId" = $2`,
        [amount, escrow.ownerUserId]
    );

    await db.query(
        `UPDATE escrows SET status = 'refunded', "refundedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        [escrow.id]
    );

    await addWalletTransaction(db, {
        userId: escrow.ownerUserId,
        loadId: escrow.loadId,
        offerId: escrow.offerId,
        escrowId: escrow.id,
        type: 'refund',
        amount,
        currency: escrow.currency,
        description
    });

    return { ...escrow, status: 'refunded' };
}
function createMobileToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            email: user.email,
            role: user.role || 'client'
        },
        MOBILE_JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function checkMobileAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не передан' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, MOBILE_JWT_SECRET);
        req.mobileUser = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Неверный или просроченный токен' });
    }
}

function getRequestUser(req) {
    if (req.session?.userId) {
        return {
            userId: Number(req.session.userId),
            role: null,
            authType: 'session'
        };
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, MOBILE_JWT_SECRET);
        return {
            userId: Number(decoded.userId),
            role: decoded.role || null,
            authType: 'mobile'
        };
    } catch (err) {
        return null;
    }
}

// --- 2. РОУТЫ АВТОРИЗАЦИИ ---

async function sendRegistrationEmailCode(normalizedEmail) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await query('DELETE FROM registration_email_codes WHERE email = $1', [normalizedEmail]);
    await query(
        'INSERT INTO registration_email_codes (email, code, expires_at) VALUES ($1, $2, $3)',
        [normalizedEmail, code, expiresAt]
    );

    const sent = await sendEmail({
        to: normalizedEmail,
        subject: '\u041a\u043e\u0434 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f RouteHub',
        text: [
            '\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435!',
            '',
            '\u0412\u0430\u0448 \u043a\u043e\u0434 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f \u0434\u043b\u044f \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u0432 RouteHub: ' + code,
            '',
            '\u041a\u043e\u0434 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 15 \u043c\u0438\u043d\u0443\u0442. \u0415\u0441\u043b\u0438 \u0432\u044b \u043d\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u043b\u0438\u0441\u044c, \u043f\u0440\u043e\u0441\u0442\u043e \u043f\u0440\u043e\u0438\u0433\u043d\u043e\u0440\u0438\u0440\u0443\u0439\u0442\u0435 \u044d\u0442\u043e \u043f\u0438\u0441\u044c\u043c\u043e.',
            '',
            'RouteHub'
        ].join('\n'),
        html: '<div lang="ru" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #0F172A;">'
            + '<h2 style="color: #22C55E; margin-bottom: 12px;">\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u043f\u043e\u0447\u0442\u044b</h2>'
            + '<p>\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435!</p>'
            + '<p>\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u044d\u0442\u043e\u0442 \u043a\u043e\u0434 \u0432 \u0444\u043e\u0440\u043c\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 RouteHub:</p>'
            + '<div style="background: #081120; color: #22C55E; font-size: 36px; font-weight: bold; text-align: center; padding: 20px; border-radius: 12px; letter-spacing: 8px;">' + code + '</div>'
            + '<p style="color: #64748B; margin-top: 18px;">\u041a\u043e\u0434 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 15 \u043c\u0438\u043d\u0443\u0442. \u0415\u0441\u043b\u0438 \u0432\u044b \u043d\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u043b\u0438\u0441\u044c, \u043f\u0440\u043e\u0441\u0442\u043e \u043f\u0440\u043e\u0438\u0433\u043d\u043e\u0440\u0438\u0440\u0443\u0439\u0442\u0435 \u044d\u0442\u043e \u043f\u0438\u0441\u044c\u043c\u043e.</p>'
            + '<p style="color: #94A3B8; font-size: 12px; margin-top: 24px;">RouteHub</p>'
            + '</div>',
    });

    return Boolean(sent);
}

async function verifyRegistrationEmailCode(normalizedEmail, code) {
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) return { ok: false, error: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434 \u0438\u0437 \u043f\u0438\u0441\u044c\u043c\u0430' };

    const row = await getOne(
        'SELECT * FROM registration_email_codes WHERE email = $1 AND code = $2 AND used = false ORDER BY id DESC LIMIT 1',
        [normalizedEmail, normalizedCode]
    );

    if (!row) return { ok: false, error: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043a\u043e\u0434 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f' };
    if (new Date() > new Date(row.expires_at)) return { ok: false, error: '\u041a\u043e\u0434 \u0438\u0441\u0442\u0435\u043a. \u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u0435 \u043d\u043e\u0432\u044b\u0439' };

    return { ok: true, id: row.id };
}

async function handleRegistrationEmailCodeRequest(req, res) {
    const normalizedEmail = normalizeEmail(req.body?.email);
    const normalizedPhone = normalizePhone(req.body?.phone);

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ error: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 Email' });
    }

    if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430' });
    }

    try {
        const existingEmail = await getOne('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (existingEmail) return res.status(400).json({ error: '\u042d\u0442\u043e\u0442 Email \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442' });

        const existingPhone = await getOne('SELECT id FROM users WHERE phone = $1', [normalizedPhone]);
        if (existingPhone) return res.status(400).json({ error: '\u042d\u0442\u043e\u0442 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442' });

        const sent = await sendRegistrationEmailCode(normalizedEmail);
        if (!sent) return res.status(500).json({ error: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043f\u0438\u0441\u044c\u043c\u043e. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043f\u043e\u0447\u0442\u043e\u0432\u044b\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430', smtp: lastEmailSendError });

        res.json({ ok: true });
    } catch (err) {
        console.error('Registration email code error:', err);
        res.status(500).json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430' });
    }
}

app.post('/api/register/email-code', handleRegistrationEmailCodeRequest);
app.post('/api/mobile/register/email-code', handleRegistrationEmailCodeRequest);

app.post('/api/register', async (req, res) => {
    const { name, email, password, role, phone, company, person_type, emailCode } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ error: '??????? ?????????? Email' });
    }

    if (!isValidPassword(password)) {
        return res.status(400).json({ error: '?????? ?????? ???? ?? ?????? 6 ????????' });
    }

    if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: '??????? ?????????? ????? ????????' });
    }

    try {
        const existingEmail = await getOne('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (existingEmail) return res.status(400).json({ error: '???? Email ??? ?????' });

        const existingPhone = await getOne('SELECT id FROM users WHERE phone = $1', [normalizedPhone]);
        if (existingPhone) return res.status(400).json({ error: '???? ????? ???????? ??? ?????' });

        const emailCheck = await verifyRegistrationEmailCode(normalizedEmail, emailCode);
        if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await query(
            `INSERT INTO users (name, email, password, role, phone, company, person_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [name, normalizedEmail, hashedPassword, role || 'client', normalizedPhone, company || '', person_type || 'individual']
        );

        await query('UPDATE registration_email_codes SET used = true WHERE id = $1', [emailCheck.id]);

        const userCode = await assignUserCode(result.rows[0].id);
        req.session.userId = result.rows[0].id;
        res.json({ ok: true, user_code: userCode });
    } catch (e) {
        if (isUniqueViolation(e)) {
            return res.status(400).json({ error: '???? Email ??? ?????' });
        }
        console.error('Register error:', e);
        res.status(500).json({ error: '?????? ????: ' + e.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await getOne('SELECT * FROM users WHERE email = $1', [email]);
        if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        req.session.userId = user.id;
        res.json({ ok: true });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/me', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

    const userId = req.session.userId;

    try {
        const user = await getOne(
            'SELECT id, name, email, phone, company, role, person_type, user_code, ecp_verified, address, iin, registration_certificate_file FROM users WHERE id = $1',
            [userId]
        );

        if (!user) return res.status(401).json({ error: 'User not found' });

        const row = await getOne('SELECT COUNT(*)::int as "activeCount" FROM loads WHERE "userId" = $1', [userId]);
        const ratingRow = await getOne(
            'SELECT COALESCE(AVG(rating), 0)::float AS "averageRating", COUNT(*)::int AS "totalReviews" FROM reviews WHERE "revieweeId" = $1',
            [userId]
        );
        const averageRating = Number(ratingRow?.averageRating || 0);

        res.json({
            ...user,
            activeLoads: row ? row.activeCount : 0,
            averageRating: Math.round(averageRating * 100) / 100,
            totalReviews: ratingRow ? ratingRow.totalReviews : 0,
            wallet: await getWalletPayload(userId)
        });
    } catch (err) {
        console.error('/api/me error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/wallet', checkAuth, async (req, res) => {
    try {
        const wallet = await getWalletPayload(req.session.userId);
        res.json(wallet);
    } catch (err) {
        console.error('/api/wallet error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/wallet/topup-details', checkAuth, async (req, res) => {
    res.json({ ok: true, details: getTopupPaymentDetails() });
});

app.get('/api/wallet/topup-requests', checkAuth, async (req, res) => {
    try {
        const requests = await getMany(
            `SELECT id, amount::float AS amount, currency, status, "receiptFile", "receiptOriginalName", "adminComment", "createdAt", "reviewedAt"
             FROM wallet_topup_requests
             WHERE "userId" = $1
             ORDER BY id DESC
             LIMIT 20`,
            [req.session.userId]
        );
        res.json({ ok: true, requests, details: getTopupPaymentDetails() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wallet/topup-request', checkAuth, async (req, res) => {
    try {
        const request = await createWalletTopupRequest(req.session.userId, req.body || {});
        res.json({ ok: true, request, wallet: await getWalletPayload(req.session.userId) });
    } catch (err) {
        console.error('/api/wallet/topup-request error:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

app.get('/api/wallet/withdraw-requests', checkAuth, async (req, res) => {
    try {
        const requests = await getMany('SELECT id, amount::float AS amount, currency, status, "payoutDetails", "adminComment", "createdAt", "reviewedAt" FROM wallet_withdraw_requests WHERE "userId" = $1 ORDER BY id DESC LIMIT 20', [req.session.userId]);
        res.json({ ok: true, requests });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wallet/withdraw-request', checkAuth, async (req, res) => {
    try {
        const request = await createWalletWithdrawRequest(req.session.userId, req.body || {});
        res.json({ ok: true, request, wallet: await getWalletPayload(req.session.userId) });
    } catch (err) {
        console.error('/api/wallet/withdraw-request error:', err);
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    }
});
app.post('/api/wallet/topup-test', checkAuth, async (req, res) => {
    if (process.env.ALLOW_TEST_BALANCE !== 'true') {
        return res.status(404).json({ error: 'Not found' });
    }

    const userId = req.session.userId;
    const amount = toMoney(req.body?.amount || 0);

    if (amount <= 0 || amount > 10000000) {
        return res.status(400).json({ error: 'Укажи сумму от 1 до 10 000 000 ₸' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureWallet(client, userId, { lock: true });
        await client.query(
            `UPDATE wallets SET balance = balance + $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2`,
            [amount, userId]
        );
        await addWalletTransaction(client, {
            userId,
            type: 'topup_test',
            amount,
            description: 'Тестовое пополнение баланса'
        });
        await client.query('COMMIT');
        res.json({ ok: true, wallet: await getWalletPayload(userId) });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('/api/wallet/topup-test error:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    } finally {
        client.release();
    }
});
// --- MOBILE AUTH (JWT) ---

app.post('/api/mobile/register/check', async (req, res) => {
    const { email, phone } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ error: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 Email' });
    }

    if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430' });
    }

    try {
        const existingEmail = await getOne('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (existingEmail) return res.status(400).json({ error: '\u042d\u0442\u043e\u0442 Email \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442' });

        const existingPhone = await getOne('SELECT id FROM users WHERE phone = $1', [normalizedPhone]);
        if (existingPhone) return res.status(400).json({ error: '\u042d\u0442\u043e\u0442 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442' });

        res.json({ ok: true });
    } catch (err) {
        console.error('Mobile register check error:', err);
        res.status(500).json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430' });
    }
});

app.post('/api/mobile/register', async (req, res) => {
    const { name, email, password, role, phone, company, person_type, firebaseIdToken } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ error: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 Email' });
    }

    if (!isValidPassword(password)) {
        return res.status(400).json({ error: '\u041f\u0430\u0440\u043e\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u043d\u0435 \u043a\u043e\u0440\u043e\u0447\u0435 6 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432' });
    }

    if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430' });
    }

    try {
        const phoneCheck = await verifyFirebasePhoneToken(firebaseIdToken, normalizedPhone);
        if (!phoneCheck.ok) return res.status(400).json({ error: phoneCheck.error });

        const existingEmail = await getOne('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (existingEmail) return res.status(400).json({ error: '\u042d\u0442\u043e\u0442 Email \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442' });

        const existingPhone = await getOne('SELECT id FROM users WHERE phone = $1', [normalizedPhone]);
        if (existingPhone) return res.status(400).json({ error: '\u042d\u0442\u043e\u0442 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442' });

        const verifiedPhone = phoneCheck.phone || normalizedPhone;

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await query(
            `INSERT INTO users (name, email, password, role, phone, company, person_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [name, normalizedEmail, hashedPassword, role || 'client', verifiedPhone, company || '', person_type || 'individual']
        );

        const userCode = await assignUserCode(result.rows[0].id);

        const newUser = {
            id: result.rows[0].id,
            name,
            email: normalizedEmail,
            role: role || 'client'
        };

        const token = createMobileToken(newUser);

        res.json({
            ok: true,
            token,
            user: {
                id: newUser.id,
                name,
                email: normalizedEmail,
                phone: verifiedPhone,
                company: company || '',
                role: role || 'client',
                person_type: person_type || 'individual',
                user_code: userCode,
                ecp_verified: false
            }
        });
    } catch (e) {
        if (isUniqueViolation(e)) {
            return res.status(400).json({ error: '\u042d\u0442\u043e\u0442 Email \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442' });
        }
        console.error('Mobile register error:', e);
        res.status(500).json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430' });
    }
});
app.post('/api/mobile/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await getOne('SELECT * FROM users WHERE email = $1', [email]);

        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        const token = createMobileToken(user);

        res.json({
            ok: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone || '',
                company: user.company || '',
                role: user.role || 'client',
                person_type: user.person_type || 'individual',
                user_code: user.user_code || String(user.id).padStart(6, '0'),
                ecp_verified: Boolean(user.ecp_verified)
            }
        });
    } catch (err) {
        console.error('Mobile login error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/mobile/change-password', checkMobileAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const current = String(currentPassword || '');
    const next = String(newPassword || '');

    if (!current || !next) return res.status(400).json({ error: 'Укажи текущий и новый пароль' });
    if (next.length < 6) return res.status(400).json({ error: 'Новый пароль должен быть минимум 6 символов' });
    if (current === next) return res.status(400).json({ error: 'Новый пароль должен отличаться от текущего' });

    try {
        const user = await getOne('SELECT password FROM users WHERE id = $1', [req.mobileUser.userId]);
        if (!user || !(await bcrypt.compare(current, user.password))) {
            return res.status(400).json({ error: 'Текущий пароль указан неверно' });
        }

        const hashedPassword = await bcrypt.hash(next, 10);
        await query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.mobileUser.userId]);
        res.json({ ok: true });
    } catch (err) {
        console.error('Mobile change password error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
app.get('/api/mobile/me', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;

    try {
        const user = await getOne(
            'SELECT id, name, email, phone, company, role, person_type, user_code, ecp_verified, address, iin, registration_certificate_file FROM users WHERE id = $1',
            [userId]
        );

        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        const row = await getOne(
            'SELECT COUNT(*)::int as "activeCount" FROM loads WHERE "userId" = $1',
            [userId]
        );

        const wallet = await getWalletPayload(userId);

        res.json({
            ...user,
            activeLoads: row ? row.activeCount : 0,
            wallet
        });
    } catch (err) {
        console.error('/api/mobile/me error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/mobile/wallet', checkMobileAuth, async (req, res) => {
    try {
        const wallet = await getWalletPayload(req.mobileUser.userId);
        res.json(wallet);
    } catch (err) {
        console.error('/api/mobile/wallet error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/mobile/wallet/topup-details', checkMobileAuth, async (req, res) => {
    res.json({ ok: true, details: getTopupPaymentDetails() });
});

app.get('/api/mobile/wallet/topup-requests', checkMobileAuth, async (req, res) => {
    try {
        const requests = await getMany(
            `SELECT id, amount::float AS amount, currency, status, "receiptFile", "receiptOriginalName", "adminComment", "createdAt", "reviewedAt"
             FROM wallet_topup_requests
             WHERE "userId" = $1
             ORDER BY id DESC
             LIMIT 20`,
            [req.mobileUser.userId]
        );
        res.json({ ok: true, requests, details: getTopupPaymentDetails() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mobile/wallet/topup-request', checkMobileAuth, async (req, res) => {
    try {
        let request;
        if (String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data')) {
            const parsed = await parseMultipartRequest(req);
            const receipt = parsed.files.receipt;
            if (!receipt) {
                const error = new Error('\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u044e \u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u0435');
                error.statusCode = 400;
                throw error;
            }
            request = await createWalletTopupRequest(req.mobileUser.userId, {
                amount: parsed.fields.amount,
                fileName: receipt.fileName,
                mimeType: receipt.mimeType,
                receiptData: receipt.buffer.toString('base64')
            });
        } else {
            request = await createWalletTopupRequest(req.mobileUser.userId, req.body || {});
        }
        res.json({ ok: true, request, wallet: await getWalletPayload(req.mobileUser.userId) });
    } catch (err) {
        console.error('/api/mobile/wallet/topup-request error:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

app.get('/api/mobile/wallet/withdraw-requests', checkMobileAuth, async (req, res) => {
    try {
        const requests = await getMany('SELECT id, amount::float AS amount, currency, status, "payoutDetails", "adminComment", "createdAt", "reviewedAt" FROM wallet_withdraw_requests WHERE "userId" = $1 ORDER BY id DESC LIMIT 20', [req.mobileUser.userId]);
        res.json({ ok: true, requests });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/mobile/wallet/withdraw-request', checkMobileAuth, async (req, res) => {
    try {
        const request = await createWalletWithdrawRequest(req.mobileUser.userId, req.body || {});
        res.json({ ok: true, request, wallet: await getWalletPayload(req.mobileUser.userId) });
    } catch (err) {
        console.error('/api/mobile/wallet/withdraw-request error:', err);
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    }
});
app.post('/api/mobile/wallet/topup-test', checkMobileAuth, async (req, res) => {
    if (process.env.ALLOW_TEST_BALANCE !== 'true') {
        return res.status(404).json({ error: 'Not found' });
    }

    const userId = req.mobileUser.userId;
    const amount = toMoney(req.body?.amount || 0);

    if (amount <= 0 || amount > 10000000) {
        return res.status(400).json({ error: 'Укажи сумму от 1 до 10 000 000 ₸' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureWallet(client, userId, { lock: true });
        await client.query(
            `UPDATE wallets SET balance = balance + $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2`,
            [amount, userId]
        );
        await addWalletTransaction(client, {
            userId,
            type: 'topup_test',
            amount,
            description: 'Тестовое пополнение баланса'
        });
        await client.query('COMMIT');
        res.json({ ok: true, wallet: await getWalletPayload(userId) });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('/api/mobile/wallet/topup-test error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    } finally {
        client.release();
    }
});
app.post('/api/mobile/push-tokens', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const { token, platform } = req.body || {};

    if (!isExpoPushToken(token)) {
        return res.status(400).json({ error: 'Некорректный push token' });
    }

    try {
        await query(`
            INSERT INTO push_tokens ("userId", token, platform, "updatedAt")
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (token)
            DO UPDATE SET
                "userId" = EXCLUDED."userId",
                platform = EXCLUDED.platform,
                "updatedAt" = CURRENT_TIMESTAMP
        `, [userId, token, platform || null]);

        res.json({ ok: true });
    } catch (err) {
        console.error('/api/mobile/push-tokens POST error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.delete('/api/mobile/push-tokens', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const { token } = req.body || {};

    if (!isExpoPushToken(token)) {
        return res.status(400).json({ error: 'Некорректный push token' });
    }

    try {
        await query(
            'DELETE FROM push_tokens WHERE "userId" = $1 AND token = $2',
            [userId, token]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('/api/mobile/push-tokens DELETE error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.put('/api/mobile/loads/:id/carrier-location', checkMobileAuth, async (req, res) => {
    const loadId = Number(req.params.id);
    const carrierUserId = Number(req.mobileUser.userId);
    const lat = Number(req.body?.lat);
    const lon = Number(req.body?.lon);
    const accuracy = req.body?.accuracy === undefined ? null : Number(req.body.accuracy);
    const heading = req.body?.heading === undefined ? null : Number(req.body.heading);
    const speed = req.body?.speed === undefined ? null : Number(req.body.speed);

    if (!Number.isFinite(loadId) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ error: 'Некорректная геолокация' });
    }

    try {
        const load = await getOne(
            `SELECT loads.id, loads.status, offers."carrierUserId" AS "acceptedCarrierUserId"
             FROM loads
             JOIN offers ON offers."loadId" = loads.id AND offers.status = 'accepted'
             WHERE loads.id = $1`,
            [loadId]
        );

        if (!load || Number(load.acceptedCarrierUserId) !== carrierUserId || load.status !== 'assigned') {
            return res.status(403).json({ error: 'Геолокацию может отправлять только назначенный перевозчик' });
        }

        await query(
            `INSERT INTO carrier_locations ("loadId", "carrierUserId", lat, lon, accuracy, heading, speed, "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
             ON CONFLICT ("loadId")
             DO UPDATE SET
                "carrierUserId" = EXCLUDED."carrierUserId",
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                accuracy = EXCLUDED.accuracy,
                heading = EXCLUDED.heading,
                speed = EXCLUDED.speed,
                "updatedAt" = CURRENT_TIMESTAMP`,
            [loadId, carrierUserId, lat, lon, Number.isFinite(accuracy) ? accuracy : null, Number.isFinite(heading) ? heading : null, Number.isFinite(speed) ? speed : null]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('/api/mobile/loads/:id/carrier-location PUT error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/mobile/loads/:id/carrier-location', checkMobileAuth, async (req, res) => {
    const loadId = Number(req.params.id);
    const ownerId = Number(req.mobileUser.userId);

    if (!Number.isFinite(loadId)) {
        return res.status(400).json({ error: 'Некорректный груз' });
    }

    try {
        const row = await getOne(
            `SELECT
                carrier_locations.lat,
                carrier_locations.lon,
                carrier_locations.accuracy,
                carrier_locations.heading,
                carrier_locations.speed,
                carrier_locations."updatedAt",
                users.name AS "carrierName"
             FROM loads
             JOIN offers
                ON offers."loadId" = loads.id
               AND offers.status = 'accepted'
             LEFT JOIN carrier_locations
                ON carrier_locations."loadId" = loads.id
               AND carrier_locations."carrierUserId" = offers."carrierUserId"
             LEFT JOIN users ON users.id = offers."carrierUserId"
             WHERE loads.id = $1 AND loads."userId" = $2`,
            [loadId, ownerId]
        );

        if (!row) {
            return res.status(403).json({ error: 'Геолокация доступна только владельцу этого груза' });
        }

        if (row.lat === null || row.lon === null || row.lat === undefined || row.lon === undefined) {
            return res.json({ available: false });
        }

        res.json({
            available: true,
            lat: Number(row.lat),
            lon: Number(row.lon),
            accuracy: row.accuracy === null ? null : Number(row.accuracy),
            heading: row.heading === null ? null : Number(row.heading),
            speed: row.speed === null ? null : Number(row.speed),
            updatedAt: row.updatedAt,
            carrierName: row.carrierName || 'Перевозчик'
        });
    } catch (err) {
        console.error('/api/mobile/loads/:id/carrier-location GET error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
function getRouteViaPoints(fromLocation, toLocation) {
    const from = String(fromLocation || '').toLowerCase();
    const to = String(toLocation || '').toLowerCase();
    const has = (city) => from.includes(city) || to.includes(city);
    if ((has('алматы') && has('астана')) || (has('астана') && has('алматы'))) return ['Балхаш', 'Караганда'];
    if ((has('алматы') && has('шымкент')) || (has('шымкент') && has('алматы'))) return ['Тараз'];
    if ((has('астана') && has('караганда')) || (has('караганда') && has('астана'))) return ['Темиртау'];
    if ((has('кызылорда') && has('астана')) || (has('астана') && has('кызылорда'))) return ['Туркестан', 'Шымкент', 'Караганда'];
    if ((has('актобе') && has('алматы')) || (has('алматы') && has('актобе'))) return ['Кызылорда', 'Шымкент', 'Тараз'];
    return [];
}

app.get('/api/mobile/carrier-routes', checkMobileAuth, async (req, res) => {
    try {
        if (req.mobileUser.role !== 'client') {
            return res.status(403).json({ error: '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u0442\u043e\u043b\u044c\u043a\u043e \u0433\u0440\u0443\u0437\u043e\u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0443' });
        }

        const rows = await getMany(`
            SELECT
                users.id AS "carrierId",
                users.name AS "carrierName",
                users.company AS "carrierCompany",
                users.phone AS "carrierPhone",
                users.user_code AS "carrierCode",
                users.ecp_verified AS "carrierEcpVerified",
                COALESCE(AVG(reviews.rating), 0)::float AS rating,
                COUNT(reviews.id)::int AS "reviewsCount",
                active_load.id AS "loadId",
                active_load.from_location,
                active_load.to_location,
                active_load.type AS "loadType",
                active_load.date AS "loadDate",
                active_load.status AS "loadStatus"
            FROM users
            LEFT JOIN LATERAL (
                SELECT loads.*
                FROM offers
                JOIN loads ON loads.id = offers."loadId"
                WHERE offers."carrierUserId" = users.id
                  AND offers.status = 'accepted'
                  AND loads.status = 'assigned'
                ORDER BY loads.id DESC
                LIMIT 1
            ) active_load ON true
            LEFT JOIN reviews ON reviews."revieweeId" = users.id
            WHERE users.role = 'carrier'
            GROUP BY users.id, active_load.id, active_load.from_location, active_load.to_location, active_load.type, active_load.date, active_load.status
            ORDER BY active_load.id DESC NULLS LAST, users.id DESC
            LIMIT 80
        `);

        res.json(rows.map((row) => ({
            ...row,
            viaPoints: getRouteViaPoints(row.from_location, row.to_location)
        })));
    } catch (err) {
        console.error('/api/mobile/carrier-routes error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mobile/carrier-routes/:carrierId/propose', checkMobileAuth, async (req, res) => {
    const ownerId = Number(req.mobileUser.userId);
    const carrierId = Number(req.params.carrierId);
    const loadId = Number(req.body?.loadId);
    const price = Number(req.body?.price);
    const currency = String(req.body?.currency || 'KZT').trim() || 'KZT';
    const pickupDate = String(req.body?.pickupDate || '').trim();
    const truckType = String(req.body?.truckType || '').trim();
    const comment = String(req.body?.comment || '').trim();

    if (req.mobileUser.role !== 'client') return res.status(403).json({ error: 'Предлагать груз может только грузовладелец' });
    if (!Number.isFinite(carrierId) || !Number.isFinite(loadId)) return res.status(400).json({ error: 'Некорректный груз или перевозчик' });
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'Укажите цену предложения' });

    try {
        const load = await getOne('SELECT * FROM loads WHERE id = $1 AND "userId" = $2', [loadId, ownerId]);
        if (!load) return res.status(404).json({ error: 'Груз не найден или не принадлежит вам' });
        if (String(load.status || 'open').toLowerCase() !== 'open') return res.status(400).json({ error: 'Предложить можно только открытый груз' });

        const carrier = await getOne('SELECT id, name, phone, role FROM users WHERE id = $1', [carrierId]);
        if (!carrier || carrier.role !== 'carrier') return res.status(404).json({ error: 'Перевозчик не найден' });

        const existing = await getOne(
            'SELECT * FROM offers WHERE "loadId" = $1 AND "carrierUserId" = $2 ORDER BY id DESC LIMIT 1',
            [loadId, carrierId]
        );
        let offerId;
        let alreadyExists = false;

        if (existing) {
            if (String(existing.initiator || 'carrier') !== 'owner') {
                return res.status(409).json({ error: 'Этот перевозчик уже отправил ставку по грузу. Откройте предложенные ставки и примите или отклоните ее.' });
            }
            if (existing.status === 'accepted') {
                return res.status(400).json({ error: 'Это предложение уже принято' });
            }

            await query(
                `UPDATE offers
                 SET price = $1, currency = $2, "pickupDate" = $3, "truckType" = $4, comment = $5, status = 'pending', initiator = 'owner'
                 WHERE id = $6`,
                [price, currency, pickupDate || load.date || '', truckType || load.type || '', comment || 'Грузовладелец предлагает этот груз перевозчику', existing.id]
            );
            offerId = existing.id;
            alreadyExists = true;
        } else {
            const result = await query(
                `INSERT INTO offers ("loadId", "carrierUserId", "carrierName", "carrierPhone", price, currency, "pickupDate", "truckType", comment, status, initiator)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'owner')
                 RETURNING id`,
                [loadId, carrierId, carrier.name || 'Перевозчик', carrier.phone || '', price, currency, pickupDate || load.date || '', truckType || load.type || '', comment || 'Грузовладелец предлагает этот груз перевозчику']
            );
            offerId = result.rows[0].id;
        }

        await sendExpoPushNotifications([carrierId], {
            title: 'Вам предложили груз',
            body: makeLoadStatusPushBody(load, 'Грузовладелец предложил вам груз'),
            data: { type: 'load_proposed', loadId: String(loadId), offerId: String(offerId) }
        });

        res.json({ ok: true, offerId, alreadyExists });
    } catch (err) {
        console.error('/api/mobile/carrier-routes/:carrierId/propose error:', err);
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/mobile/loads', async (req, res) => {
    try {
        const rows = await getMany("SELECT * FROM loads WHERE COALESCE(status, 'open') = 'open' ORDER BY id DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/mobile/my-loads', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;

    try {
        const rows = await getMany(
            `SELECT
                loads.*,
                offers."carrierUserId" AS "acceptedCarrierUserId",
                offers."carrierName" AS "acceptedCarrierName",
                offers."carrierPhone" AS "acceptedCarrierPhone",
                EXISTS (
                    SELECT 1 FROM reviews
                    WHERE reviews."reviewerId" = $1
                      AND reviews."loadId" = loads.id
                ) AS "reviewGiven",
                escrows.status AS "escrowStatus",
                escrows.amount AS "escrowAmount",
                escrows."carrierAmount" AS "escrowCarrierAmount",
                escrows."commissionAmount" AS "escrowCommissionAmount"
             FROM loads
             LEFT JOIN offers
                ON offers."loadId" = loads.id
               AND offers.status = 'accepted'
             LEFT JOIN escrows
                ON escrows."loadId" = loads.id
               AND escrows.status IN ('held', 'released')
             WHERE loads."userId" = $1
             ORDER BY loads.id DESC`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/mobile/my-offers', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;

    const sql = `
        SELECT
            offers.*,
            loads.from_location,
            loads.to_location,
            loads.type AS load_type,
            loads.weight,
            loads.status AS load_status,
            loads."clientCompleted" AS "clientCompleted",
            loads."carrierCompleted" AS "carrierCompleted",
            loads."userId" AS "ownerId",
                    users.name AS "ownerName",
                    users.company AS "ownerCompany",
                    EXISTS (
                        SELECT 1 FROM reviews
                        WHERE reviews."reviewerId" = $1
                          AND reviews."loadId" = loads.id
                    ) AS "reviewGiven"
                FROM offers
                JOIN loads ON loads.id = offers."loadId"
                JOIN users ON users.id = loads."userId"
                WHERE offers."carrierUserId" = $1
        ORDER BY offers.id DESC
    `;

    try {
        const rows = await getMany(sql, [userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/mobile/offers-screen', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const role = req.mobileUser.role;

    try {
        if (role === 'carrier') {
            const sql = `
                SELECT
                    offers.*,
                    loads.from_location,
                    loads.to_location,
                    loads.type AS load_type,
                    loads.weight,
                    loads.status AS load_status,
                    loads."clientCompleted" AS "clientCompleted",
                    loads."carrierCompleted" AS "carrierCompleted",
                    loads."userId" AS "ownerId",
                    users.name AS "ownerName",
                    users.company AS "ownerCompany",
                    EXISTS (
                        SELECT 1 FROM reviews
                        WHERE reviews."reviewerId" = $1
                          AND reviews."loadId" = loads.id
                    ) AS "reviewGiven"
                FROM offers
                JOIN loads ON loads.id = offers."loadId"
                JOIN users ON users.id = loads."userId"
                WHERE offers."carrierUserId" = $1
                ORDER BY offers.id DESC
            `;

            const rows = await getMany(sql, [userId]);

            return res.json({
                mode: 'carrier',
                title: 'Мои ставки',
                items: rows
            });
        }

        const sql = `
            SELECT
                offers.*,
                loads.from_location,
                loads.to_location,
                loads.type AS load_type,
                loads.weight,
                loads.status AS load_status,
                loads."clientCompleted" AS "clientCompleted",
                loads."carrierCompleted" AS "carrierCompleted",
                loads."userId" AS "ownerId",
                users.name AS "ownerName",
                users.company AS "ownerCompany",
                EXISTS (
                    SELECT 1 FROM reviews
                    WHERE reviews."reviewerId" = $1
                      AND reviews."loadId" = loads.id
                ) AS "reviewGiven"
            FROM offers
            JOIN loads ON loads.id = offers."loadId"
            JOIN users ON users.id = loads."userId"
            WHERE loads."userId" = $1
            ORDER BY offers.id DESC
        `;

        const rows = await getMany(sql, [userId]);

        res.json({
            mode: 'owner',
            title: 'Предложенные ставки',
            items: rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mobile/offers/:id/accept', checkMobileAuth, async (req, res) => {
    const offerId = Number(req.params.id);
    const actorId = Number(req.mobileUser.userId);
    const client = await pool.connect();
    let ownerInitiated = false;

    try {
        await client.query('BEGIN');

        const offerResult = await client.query('SELECT * FROM offers WHERE id = $1 FOR UPDATE', [offerId]);
        const offer = offerResult.rows[0];
        if (!offer) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Ставка не найдена' });
        }

        ownerInitiated = String(offer.initiator || 'carrier') === 'owner';

        const loadResult = ownerInitiated
            ? await client.query('SELECT * FROM loads WHERE id = $1 FOR UPDATE', [offer.loadId])
            : await client.query('SELECT * FROM loads WHERE id = $1 AND "userId" = $2 FOR UPDATE', [offer.loadId, actorId]);
        const load = loadResult.rows[0];
        if (!load) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Нет доступа к грузу' });
        }

        const ownerId = Number(load.userId);
        if (ownerInitiated && Number(offer.carrierUserId) !== actorId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Принять этот груз может только выбранный перевозчик' });
        }

        if (String(load.status || 'open').toLowerCase() !== 'open') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Груз уже не открыт' });
        }

        const carrierResult = await client.query('SELECT email, name FROM users WHERE id = $1', [offer.carrierUserId]);
        const acceptedCarrier = carrierResult.rows[0] || {};
        const ownerResult = await client.query('SELECT name FROM users WHERE id = $1', [ownerId]);
        const loadOwner = ownerResult.rows[0] || {};

        const escrow = await holdEscrowForAcceptedOffer(client, { load, offer, ownerId });

        await client.query(`UPDATE offers SET status = 'rejected' WHERE "loadId" = $1`, [offer.loadId]);
        await client.query(`UPDATE offers SET status = 'accepted' WHERE id = $1`, [offerId]);
        await cancelCarrierPendingOffersAfterAcceptance(client, {
            carrierUserId: offer.carrierUserId,
            acceptedOfferId: offerId,
            acceptedLoadId: offer.loadId
        });
        await client.query(
            `UPDATE loads
             SET status = 'assigned',
                 "clientCompleted" = false,
                 "carrierCompleted" = false,
                 "clientCompletedAt" = NULL,
                 "carrierCompletedAt" = NULL
             WHERE id = $1`,
            [offer.loadId]
        );

        await client.query(
            `INSERT INTO chats ("loadId", "clientId", "carrierId")
             VALUES ($1, $2, $3)
             ON CONFLICT ("loadId", "carrierId") DO NOTHING`,
            [offer.loadId, ownerId, offer.carrierUserId]
        );

        await client.query('COMMIT');

        if (ownerInitiated) {
            await sendExpoPushNotifications([ownerId], {
                title: 'Груз принят',
                body: makeLoadStatusPushBody(load, 'Перевозчик принял предложенный груз'),
                data: { type: 'offer_accepted', loadId: String(offer.loadId), offerId: String(offerId) }
            });
            return res.json({ ok: true, escrow });
        }

        await sendOfferAcceptedNotificationEmail({
            carrierEmail: acceptedCarrier.email,
            carrierName: acceptedCarrier.name || offer.carrierName,
            ownerName: loadOwner.name,
            load,
            offer
        });

        await sendExpoPushNotifications([offer.carrierUserId], {
            title: 'Ставка принята',
            body: makeLoadStatusPushBody(load, 'Вашу ставку приняли'),
            data: { type: 'offer_accepted', loadId: String(offer.loadId), offerId: String(offerId) }
        });

        res.json({ ok: true, escrow, wallet: await getWalletPayload(ownerId) });
    } catch (err) {
        await client.query('ROLLBACK');
        const payload = { error: err.message };
        if (!ownerInitiated && err.wallet) payload.wallet = err.wallet;
        res.status(err.statusCode || 500).json(payload);
    } finally {
        client.release();
    }
});
// POST /api/mobile/reviews — создать отзыв
app.post('/api/mobile/reviews', checkMobileAuth, async (req, res) => {
    const reviewerId = String(req.mobileUser.userId);
    const revieweeId = String(req.body.revieweeId);
    const loadId = String(req.body.loadId);
    const rating = Number(req.body.rating);
    const text = (req.body.text || '').trim();

    if (!revieweeId || !loadId || !rating) {
        return res.status(400).json({ error: 'Укажи revieweeId, loadId и rating' });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Оценка должна быть от 1 до 5' });
    }

    if (reviewerId === revieweeId) {
        return res.status(400).json({ error: 'Нельзя оставить отзыв самому себе' });
    }

    try {
        const load = await getOne(`
            SELECT
                loads.id,
                loads.status,
                loads."userId"::text AS "ownerId",
                offers."carrierUserId"::text AS "carrierId"
            FROM loads
            LEFT JOIN offers
                ON offers."loadId" = loads.id
               AND offers.status = 'accepted'
            WHERE loads.id = $1
        `, [loadId]);

        if (!load) {
            return res.status(404).json({ error: 'Груз не найден' });
        }

        if (load.status !== 'completed') {
            return res.status(400).json({ error: 'Отзыв можно оставить только после завершения груза' });
        }

        const isOwner = load.ownerId === reviewerId;
        const isCarrier = load.carrierId === reviewerId;

        if (!isOwner && !isCarrier) {
            return res.status(403).json({ error: 'Ты не участвовал в этом грузе' });
        }

        if (isOwner && load.carrierId !== revieweeId) {
            return res.status(400).json({ error: 'Грузовладелец может оставить отзыв только выбранному перевозчику' });
        }

        // перевозчик может оставить отзыв только владельцу груза
        if (isCarrier && load.ownerId !== revieweeId) {
            return res.status(400).json({ error: 'Перевозчик может оставить отзыв только владельцу груза' });
        }

        const result = await query(`
            INSERT INTO reviews ("reviewerId", "revieweeId", "loadId", rating, text)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [reviewerId, revieweeId, loadId, rating, text]);

        res.json({ ok: true, review: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Ты уже оставил отзыв по этому грузу' });
        }
        console.error('POST /api/mobile/reviews error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});


app.post('/api/reviews', checkAuth, async (req, res) => {
    const reviewerId = String(req.session.userId);
    const revieweeId = String(req.body.revieweeId || '');
    const loadId = String(req.body.loadId || '');
    const rating = Number(req.body.rating);
    const text = String(req.body.text || '').trim();

    if (!revieweeId || !loadId || !rating) {
        return res.status(400).json({ error: '\u0423\u043a\u0430\u0436\u0438 revieweeId, loadId \u0438 rating' });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: '\u041e\u0446\u0435\u043d\u043a\u0430 \u0434\u043e\u043b\u0436\u043d\u0430 \u0431\u044b\u0442\u044c \u043e\u0442 1 \u0434\u043e 5' });
    }

    if (reviewerId === revieweeId) {
        return res.status(400).json({ error: '\u041d\u0435\u043b\u044c\u0437\u044f \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043e\u0442\u0437\u044b\u0432 \u0441\u0430\u043c\u043e\u043c\u0443 \u0441\u0435\u0431\u0435' });
    }

    try {
        const load = await getOne(`
            SELECT
                loads.id,
                loads.status,
                loads."userId"::text AS "ownerId",
                offers."carrierUserId"::text AS "carrierId"
            FROM loads
            LEFT JOIN offers
                ON offers."loadId" = loads.id
               AND offers.status = 'accepted'
            WHERE loads.id = $1
        `, [loadId]);

        if (!load) {
            return res.status(404).json({ error: '\u0413\u0440\u0443\u0437 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
        }

        if (load.status !== 'completed') {
            return res.status(400).json({ error: '\u041e\u0442\u0437\u044b\u0432 \u043c\u043e\u0436\u043d\u043e \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u0441\u043b\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f \u0441\u0434\u0435\u043b\u043a\u0438' });
        }

        const isOwner = load.ownerId === reviewerId;
        const isCarrier = load.carrierId === reviewerId;

        if (!isOwner && !isCarrier) {
            return res.status(403).json({ error: '\u0422\u044b \u043d\u0435 \u0443\u0447\u0430\u0441\u0442\u0432\u043e\u0432\u0430\u043b \u0432 \u044d\u0442\u043e\u0439 \u0441\u0434\u0435\u043b\u043a\u0435' });
        }

        if (isOwner && load.carrierId !== revieweeId) {
            return res.status(400).json({ error: '\u0413\u0440\u0443\u0437\u043e\u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446 \u043c\u043e\u0436\u0435\u0442 \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043e\u0442\u0437\u044b\u0432 \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0443' });
        }

        if (isCarrier && load.ownerId !== revieweeId) {
            return res.status(400).json({ error: '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a \u043c\u043e\u0436\u0435\u0442 \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043e\u0442\u0437\u044b\u0432 \u0442\u043e\u043b\u044c\u043a\u043e \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0443 \u0433\u0440\u0443\u0437\u0430' });
        }

        const result = await query(`
            INSERT INTO reviews ("reviewerId", "revieweeId", "loadId", rating, text)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [reviewerId, revieweeId, loadId, rating, text]);

        res.json({ ok: true, review: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: '\u0422\u044b \u0443\u0436\u0435 \u043e\u0441\u0442\u0430\u0432\u0438\u043b \u043e\u0442\u0437\u044b\u0432 \u043f\u043e \u044d\u0442\u043e\u0439 \u0441\u0434\u0435\u043b\u043a\u0435' });
        }
        console.error('POST /api/reviews error:', err);
        res.status(500).json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430' });
    }
});

app.get('/api/mobile/reviews/:userId', checkMobileAuth, async (req, res) => {
    const userId = Number(req.params.userId);

    try {
        const reviews = await getMany(`
            SELECT
                reviews.id,
                reviews.rating,
                reviews.text,
                reviews."createdAt",
                reviewer.name AS "authorName",
                reviewer.role AS "authorRole",
                CONCAT(loads.from_location, ' → ', loads.to_location) AS "loadRoute"
            FROM reviews
            JOIN users reviewer ON reviewer.id = reviews."reviewerId"
            JOIN loads ON loads.id = reviews."loadId"
            WHERE reviews."revieweeId" = $1
            ORDER BY reviews."createdAt" DESC
        `, [userId]);

        const totalCount = reviews.length;
        const averageRating = totalCount > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalCount
            : 0;

        res.json({
            averageRating: Math.round(averageRating * 10) / 10,
            totalCount,
            reviews,
        });

    } catch (err) {
        console.error('GET /reviews error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/mobile/offers/:id', checkMobileAuth, async (req, res) => {
    const offerId = Number(req.params.id);
    const userId = req.mobileUser.userId;
    const { price, currency, pickupDate, truckType, comment } = req.body;

    try {
        const offer = await getOne('SELECT * FROM offers WHERE id = $1', [offerId]);
        if (!offer) return res.status(404).json({ error: 'Ставка не найдена' });
        if (Number(offer.carrierUserId) !== Number(userId)) return res.status(403).json({ error: 'Нет доступа' });
        if (offer.status === 'accepted') return res.status(400).json({ error: 'Принятую ставку нельзя изменить' });
        if (String(offer.initiator || 'carrier') !== 'carrier') return res.status(400).json({ error: 'Предложенный груз нельзя изменить как ставку' });

        await query(
            `UPDATE offers
             SET price = $1, currency = $2, "pickupDate" = $3, "truckType" = $4, comment = $5, status = 'pending', initiator = 'carrier'
             WHERE id = $6`,
            [price, currency || 'KZT', pickupDate || '', truckType || '', comment || '', offerId]
        );

        res.json({ ok: true, offerId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/mobile/offers/:id/reject', checkMobileAuth, async (req, res) => {
    const offerId = Number(req.params.id);
    const actorId = Number(req.mobileUser.userId);

    try {
        const offer = await getOne('SELECT * FROM offers WHERE id = $1', [offerId]);
        if (!offer) return res.status(404).json({ error: 'Ставка не найдена' });
        if (offer.status === 'accepted') return res.status(400).json({ error: 'Принятое предложение нельзя отклонить' });

        if (String(offer.initiator || 'carrier') === 'owner') {
            if (Number(offer.carrierUserId) !== actorId) return res.status(403).json({ error: 'Нет доступа к предложению' });
            await query(`UPDATE offers SET status = 'rejected' WHERE id = $1`, [offerId]);
            return res.json({ ok: true });
        }

        const load = await getOne(
            'SELECT * FROM loads WHERE id = $1 AND "userId" = $2',
            [offer.loadId, actorId]
        );
        if (!load) return res.status(403).json({ error: 'Нет доступа к грузу' });

        await query(`UPDATE offers SET status = 'rejected' WHERE id = $1`, [offerId]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/mobile/favorites', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;

    const sql = `
        SELECT l.* FROM loads l
        INNER JOIN favorites f ON l.id = f."loadId"
        WHERE f."userId" = $1
    `;

    try {
        const rows = await getMany(sql, [userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mobile/loads', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const payload = validateLoadPayload(req.body || {});

    if (!payload.ok) {
        return res.status(400).json({ error: payload.error });
    }

    const load = payload.value;

    try {
        const user = await getOne('SELECT phone FROM users WHERE id = $1', [userId]);
        const contact = (user && user.phone) ? user.phone : 'Контакт не указан';

        const result = await query(
            `INSERT INTO loads (
                "userId", from_location, to_location, weight, type, price, date, lat, lng,
                contact_info, volume, length, width, height, loading_type, description
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id`,
            [
                userId,
                load.from_location,
                load.to_location,
                load.weight,
                load.type,
                load.price,
                load.ready_date,
                load.lat,
                load.lng,
                contact,
                load.volume,
                load.length,
                load.width,
                load.height,
                load.loading_type,
                load.description
            ]
        );

        res.json({ ok: true, loadId: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mobile/favorites', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const { loadId } = req.body;

    if (!loadId) {
        return res.status(400).json({ error: 'ID груза не указан' });
    }

    try {
        await query(
            'INSERT INTO favorites ("userId", "loadId") VALUES ($1, $2)',
            [userId, loadId]
        );
        res.json({ ok: true });
    } catch (err) {
        if (isUniqueViolation(err)) {
            return res.status(400).json({ error: 'Уже в избранном' });
        }
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/mobile/favorites/:loadId', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const loadId = req.params.loadId;

    try {
        await query(
            'DELETE FROM favorites WHERE "userId" = $1 AND "loadId" = $2',
            [userId, loadId]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mobile/profile-document', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const { kind, fileName, mimeType, data } = req.body || {};

    if (kind !== 'registration_certificate') {
        return res.status(400).json({ error: 'Неизвестный тип документа' });
    }

    if (!fileName || !data) {
        return res.status(400).json({ error: 'Файл не передан' });
    }

    try {
        const buffer = Buffer.from(String(data), 'base64');
        const maxSize = 10 * 1024 * 1024;

        if (!buffer.length || buffer.length > maxSize) {
            return res.status(400).json({ error: 'Файл должен быть до 10 MB' });
        }

        const safeOriginalName = String(fileName).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120);
        const extFromName = path.extname(safeOriginalName).toLowerCase();
        const extFromMime = mimeType === 'application/pdf' ? '.pdf' : mimeType === 'image/png' ? '.png' : '.jpg';
        const ext = extFromName || extFromMime;
        const uploadDir = path.join(__dirname, 'uploads', 'profile-documents');
        fs.mkdirSync(uploadDir, { recursive: true });

        const storedName = `registration_${userId}_${Date.now()}${ext}`;
        const fullPath = path.join(uploadDir, storedName);
        fs.writeFileSync(fullPath, buffer);

        const publicPath = `/uploads/profile-documents/${storedName}`;
        await query('UPDATE users SET registration_certificate_file = $1 WHERE id = $2', [publicPath, userId]);

        res.json({ ok: true, fileName: safeOriginalName, fileUrl: publicPath });
    } catch (err) {
        console.error('/api/mobile/profile-document error:', err);
        res.status(500).json({ error: 'Не удалось сохранить документ' });
    }
});

app.post('/api/profile-document', checkAuth, async (req, res) => {
    const userId = req.session.userId;
    const { kind, fileName, data } = req.body || {};

    if (kind !== 'registration_certificate') {
        return res.status(400).json({ error: '\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u044b\u0439 \u0442\u0438\u043f \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430' });
    }

    if (!fileName || !data) {
        return res.status(400).json({ error: '\u0424\u0430\u0439\u043b \u043d\u0435 \u043f\u0435\u0440\u0435\u0434\u0430\u043d' });
    }

    try {
        const safeOriginalName = String(fileName).replace(/[\\/]/g, '_').slice(0, 180);
        const ext = path.extname(safeOriginalName).toLowerCase() || '.bin';
        const allowed = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
        if (!allowed.has(ext)) {
            return res.status(400).json({ error: '\u041c\u043e\u0436\u043d\u043e \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e PDF, JPG \u0438 PNG' });
        }

        const base64 = String(data).includes(',') ? String(data).split(',').pop() : String(data);
        const buffer = Buffer.from(base64, 'base64');
        if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
            return res.status(400).json({ error: '\u0424\u0430\u0439\u043b \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0434\u043e 10MB' });
        }

        const uploadDir = path.join(__dirname, 'uploads', 'profile-documents');
        fs.mkdirSync(uploadDir, { recursive: true });
        const storedName = 'registration_' + userId + '_' + Date.now() + ext;
        const fullPath = path.join(uploadDir, storedName);
        fs.writeFileSync(fullPath, buffer);

        const publicPath = '/uploads/profile-documents/' + storedName;
        await query('UPDATE users SET registration_certificate_file = $1 WHERE id = $2', [publicPath, userId]);
        res.json({ ok: true, fileName: safeOriginalName, fileUrl: publicPath });
    } catch (err) {
        console.error('/api/profile-document error:', err);
        res.status(500).json({ error: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442' });
    }
});

app.post('/api/mobile/update-profile', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;

    try {
        const user = await getOne(
            `SELECT id, name, email, phone, company, role, person_type, user_code, ecp_verified, address, iin, registration_certificate_file
             FROM users
             WHERE id = $1`,
            [userId]
        );

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({ ok: true, user });
    } catch (err) {
        console.error('/api/mobile/update-profile error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mobile/offers', checkMobileAuth, async (req, res) => {
    const carrierUserId = req.mobileUser.userId;
    const { loadId, price, currency, pickupDate, truckType, comment } = req.body;

    try {
        const user = await getOne('SELECT name, phone, role FROM users WHERE id = $1', [carrierUserId]);
        if (!user) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }

        if ((user.role || req.mobileUser.role) !== 'carrier') {
            return res.status(403).json({ error: 'Ставки могут отправлять только перевозчики' });
        }

        const load = await getOne(`
            SELECT loads.*, users.email AS "ownerEmail", users.name AS "ownerName"
            FROM loads
            JOIN users ON users.id = loads."userId"
            WHERE loads.id = $1
        `, [loadId]);
        if (!load) {
            return res.status(404).json({ error: 'Груз не найден' });
        }

        if (Number(load.userId) === Number(carrierUserId)) {
            return res.status(400).json({ error: 'Нельзя отправить ставку на свой груз' });
        }

        const existingOffer = await getOne(
            `SELECT * FROM offers WHERE "loadId" = $1 AND "carrierUserId" = $2 AND COALESCE(initiator, 'carrier') = 'carrier' ORDER BY id DESC LIMIT 1`,
            [loadId, carrierUserId]
        );
        if (existingOffer) {
            return res.status(409).json({
                error: 'вы уже отправили ставку, хотите изменить?',
                duplicateOffer: true,
                offerId: existingOffer.id,
                offer: existingOffer
            });
        }

        const result = await query(
            `INSERT INTO offers (
                "loadId",
                "carrierUserId",
                "carrierName",
                "carrierPhone",
                price,
                currency,
                "pickupDate",
                "truckType",
                comment,
                status,
                initiator
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'carrier')
            RETURNING id`,
            [
                loadId,
                carrierUserId,
                user.name || 'Перевозчик',
                user.phone || '',
                price,
                currency || 'KZT',
                pickupDate || '',
                truckType || '',
                comment || ''
            ]
        );

        const offerId = result.rows[0].id;

        try {
            await sendOfferNotificationEmail({
                loadId,
                offerId,
                ownerEmail: load.ownerEmail,
                ownerName: load.ownerName,
                load,
                carrier: user,
                offer: { price, currency: currency || 'KZT', pickupDate: pickupDate || '', truckType: truckType || '', comment: comment || '' }
            });
        } catch (emailErr) {
            console.error('Offer notification email failed:', emailErr);
        }

        await sendExpoPushNotifications([load.userId], {
            title: 'Новая ставка',
            body: makeOfferPushBody(load, user, price, currency || 'KZT'),
            data: { type: 'offer_created', loadId: String(loadId), offerId: String(offerId) }
        });

        res.json({
            ok: true,
            offerId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/mobile/loads/:id', checkMobileAuth, async (req, res) => {
    const loadId = req.params.id;
    const userId = req.mobileUser.userId;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const ownerCheck = await client.query('SELECT id FROM loads WHERE id = $1 AND "userId" = $2 FOR UPDATE', [loadId, userId]);
        if (ownerCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Груз не найден или не принадлежит вам' });
        }

        await refundEscrowForLoad(client, loadId, 'Оплата возвращена после удаления груза');
        await client.query('DELETE FROM loads WHERE id = $1 AND "userId" = $2', [loadId, userId]);

        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message });
    } finally {
        client.release();
    }
});
app.post('/api/mobile/loads/:id/complete', checkMobileAuth, async (req, res) => {
    const loadId = req.params.id;
    const userId = req.mobileUser.userId;

    try {
        const load = await getOne(
            `SELECT loads.*, offers.id AS "acceptedOfferId", offers."carrierUserId" AS "acceptedCarrierUserId"
             FROM loads
             LEFT JOIN offers ON offers."loadId" = loads.id AND offers.status = 'accepted'
             WHERE loads.id = $1`,
            [loadId]
        );

        if (!load) return res.status(404).json({ error: 'Груз не найден' });

        if (Number(load.userId) !== Number(userId) && !load.acceptedOfferId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }

        if (load.status !== 'assigned') {
            return res.status(400).json({ error: 'Можно завершить только груз с выбранным исполнителем' });
        }

        const completionState = getLoadCompletionState(load, userId, load.acceptedCarrierUserId);

        if (!completionState.actorSide) {
            return res.status(403).json({ error: 'Нет доступа' });
        }

        if (completionState.isFullyCompleted || load.status === 'completed') {
            return res.json({
                ok: true,
                status: 'completed',
                completion: completionState
            });
        }

        if (Number(load.userId) !== Number(userId)) {
            const offer = await getOne(
                `SELECT * FROM offers WHERE "loadId" = $1 AND "carrierUserId" = $2 AND status = 'accepted'`,
                [loadId, userId]
            );
            if (!offer) return res.status(403).json({ error: 'Нет доступа' });
        }

        if (completionState.actorSide === 'client') {
            await query(
                `UPDATE loads
                 SET "clientCompleted" = true,
                     "clientCompletedAt" = COALESCE("clientCompletedAt", CURRENT_TIMESTAMP),
                     status = CASE WHEN "carrierCompleted" = true THEN 'completed' ELSE status END
                 WHERE id = $1`,
                [loadId]
            );
        } else {
            await query(
                `UPDATE loads
                 SET "carrierCompleted" = true,
                     "carrierCompletedAt" = COALESCE("carrierCompletedAt", CURRENT_TIMESTAMP),
                     status = CASE WHEN "clientCompleted" = true THEN 'completed' ELSE status END
                 WHERE id = $1`,
                [loadId]
            );
        }

        const updatedLoad = await getOne(
            `SELECT loads.*, offers."carrierUserId" AS "acceptedCarrierUserId"
             FROM loads
             LEFT JOIN offers ON offers."loadId" = loads.id AND offers.status = 'accepted'
             WHERE loads.id = $1`,
            [loadId]
        );

        const updatedCompletion = getLoadCompletionState(updatedLoad, userId, updatedLoad?.acceptedCarrierUserId);
        const escrowRelease = updatedCompletion.isFullyCompleted
            ? await releaseEscrowForLoad(pool, loadId)
            : null;

        const completionRecipientIds = (updatedCompletion.isFullyCompleted
            ? [updatedLoad?.userId, updatedLoad?.acceptedCarrierUserId]
            : [completionState.actorSide === 'client' ? updatedLoad?.acceptedCarrierUserId : updatedLoad?.userId])
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id !== Number(userId));

        await sendExpoPushNotifications(completionRecipientIds, {
            title: updatedCompletion.isFullyCompleted
                ? '\u0413\u0440\u0443\u0437 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d'
                : '\u041d\u0443\u0436\u043d\u043e \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435',
            body: makeLoadStatusPushBody(
                updatedLoad,
                updatedCompletion.isFullyCompleted
                    ? '\u0413\u0440\u0443\u0437 \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d'
                    : completionState.actorSide === 'client'
                        ? '\u0413\u0440\u0443\u0437\u043e\u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043b \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0435'
                        : '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043b \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0435'
            ),
            data: {
                type: updatedCompletion.isFullyCompleted ? 'load_completed' : 'load_completion_waiting',
                loadId: String(loadId)
            }
        });

        res.json({
            ok: true,
            status: updatedCompletion.isFullyCompleted ? 'completed' : 'awaiting_other_party',
            completion: updatedCompletion,
            escrow: escrowRelease,
            message: updatedCompletion.isFullyCompleted
                ? 'Груз полностью завершен. Можно оставить отзыв'
                : updatedCompletion.actorSide === 'client'
                    ? 'Ваше подтверждение сохранено. Ждем подтверждение перевозчика'
                    : 'Ваше подтверждение сохранено. Ждем подтверждение грузовладельца'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mobile/loads/:id/unassign', checkMobileAuth, async (req, res) => {
    const loadId = req.params.id;
    const ownerId = req.mobileUser.userId;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const loadResult = await client.query(
            `SELECT * FROM loads WHERE id = $1 AND "userId" = $2 FOR UPDATE`,
            [loadId, ownerId]
        );
        const load = loadResult.rows[0];
        if (!load) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Нет доступа к грузу' });
        }

        await refundEscrowForLoad(client, loadId, 'Оплата возвращена после снятия назначения');

        await client.query(`UPDATE offers SET status = 'pending' WHERE "loadId" = $1`, [loadId]);
        await client.query(
            `UPDATE loads
             SET status = 'open',
                 "clientCompleted" = false,
                 "carrierCompleted" = false,
                 "clientCompletedAt" = NULL,
                 "carrierCompletedAt" = NULL
             WHERE id = $1`,
            [loadId]
        );

        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    } finally {
        client.release();
    }
});

const booleanSetting = (value, fallback) => {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null || value === '') return fallback;

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;

    return fallback;
};

app.post('/api/mobile/settings', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const body = req.body || {};

    try {
        const current = await getOne(
            'SELECT push_notifications, email_notifications, dark_theme FROM users WHERE id = $1',
            [userId]
        );

        const pushNotifications = booleanSetting(body.push_notifications, current?.push_notifications ?? true);
        const emailNotifications = booleanSetting(body.email_notifications, current?.email_notifications ?? false);
        const darkTheme = booleanSetting(body.dark_theme, current?.dark_theme ?? false);

        await query(
            `UPDATE users
             SET push_notifications = $1, email_notifications = $2, dark_theme = $3
             WHERE id = $4`,
            [pushNotifications, emailNotifications, darkTheme, userId]
        );

        res.json({
            ok: true,
            push_notifications: pushNotifications,
            email_notifications: emailNotifications,
            dark_theme: darkTheme,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/mobile/settings', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;

    try {
        const user = await getOne(
            'SELECT push_notifications, email_notifications, dark_theme FROM users WHERE id = $1',
            [userId]
        );

        res.json({
            push_notifications: user?.push_notifications ?? true,
            email_notifications: user?.email_notifications ?? false,
            dark_theme: user?.dark_theme ?? false,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mobile/forgot-password', async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) return res.status(400).json({ error: 'Email не указан' });

    try {
        const user = await getOne('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

        if (!user) {
            // Не раскрываем, существует ли email в системе.
            return res.json({ ok: true });
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await query('DELETE FROM password_resets WHERE email = $1', [normalizedEmail]);
        await query(
            'INSERT INTO password_resets (email, code, expires_at) VALUES ($1, $2, $3)',
            [normalizedEmail, code, expiresAt]
        );

        await sendEmail({
            to: normalizedEmail,
            subject: 'Код сброса пароля RouteHub',
            text: [
                'Здравствуйте!',
                '',
                'Вы запросили сброс пароля для аккаунта RouteHub.',
                'Ваш код подтверждения: ' + code,
                '',
                'Код действует 15 минут. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.',
                '',
                'RouteHub'
            ].join('\n'),
            html: `
                <div lang="ru" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #0F172A;">
                    <h2 style="color: #22C55E; margin-bottom: 12px;">Сброс пароля</h2>
                    <p>Здравствуйте!</p>
                    <p>Вы запросили сброс пароля для аккаунта RouteHub.</p>
                    <p>Ваш код подтверждения:</p>
                    <div style="background: #081120; color: #22C55E; font-size: 36px; font-weight: bold; text-align: center; padding: 20px; border-radius: 12px; letter-spacing: 8px;">
                        ${code}
                    </div>
                    <p style="color: #64748B; margin-top: 18px;">Код действует 15 минут. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.</p>
                    <p style="color: #94A3B8; font-size: 12px; margin-top: 24px;">RouteHub — логистическая платформа</p>
                </div>
            `,
        });

        res.json({ ok: true });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/mobile/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'Заполни все поля' });
    }

    try {
        const reset = await getOne(
            'SELECT * FROM password_resets WHERE email = $1 AND code = $2 AND used = false',
            [email.trim().toLowerCase(), code.trim()]
        );

        if (!reset) {
            return res.status(400).json({ error: 'Неверный код' });
        }

        if (new Date() > new Date(reset.expires_at)) {
            return res.status(400).json({ error: 'Код истек. Запроси новый' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email.trim().toLowerCase()]);
        await query('UPDATE password_resets SET used = true WHERE id = $1', [reset.id]);

        res.json({ ok: true });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

const ROUTE_CITY_COORDS = {
    'алматы': [76.9286, 43.2567],
    'астана': [71.4306, 51.1801],
    'шымкент': [69.5901, 42.3417],
    'кызылорда': [65.5093, 44.8488],
    'караганда': [73.0887, 49.8047],
    'актобе': [57.2067, 50.2797],
    'атырау': [51.9227, 47.1167],
    'актау': [51.1801, 43.6527],
    'костанай': [63.5744, 53.2144],
    'павлодар': [76.9674, 52.2873],
    'тараз': [71.3667, 42.9],
    'уральск': [51.3667, 51.2333],
    'семей': [80.2275, 50.4111],
    'усть каменогорск': [82.6278, 49.9787],
    'усть-каменогорск': [82.6278, 49.9787],
    'оскемен': [82.6278, 49.9787],
    'туркестан': [68.2667, 43.3],
    'жанаозен': [52.8597, 43.3456],
    'жанаөзен': [52.8597, 43.3456],
    'талдыкорган': [78.3784, 45.0167],
    'экибастуз': [75.3244, 51.7167],
    'рудный': [63.1283, 52.9628],
    'темиртау': [72.9594, 50.0594],
    'жезказган': [67.7122, 47.7972],
    'балхаш': [74.9958, 46.8481],
    'петропавловск': [69.1522, 54.875],
    'кокшетау': [69.3919, 53.2833]
};

function normalizeRouteLocation(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function resolveRouteCityCoords(location) {
    const normalized = normalizeRouteLocation(location);
    if (!normalized) return null;
    if (ROUTE_CITY_COORDS[normalized]) return ROUTE_CITY_COORDS[normalized];

    const partial = Object.entries(ROUTE_CITY_COORDS).find(([city]) => (
        normalized.includes(city) || city.includes(normalized)
    ));

    return partial ? partial[1] : null;
}
function parseWktLineString(wkt) {
    if (typeof wkt !== 'string') return [];
    const matches = [...wkt.matchAll(/LINESTRING\s*\(([^()]+)\)/gi)];
    if (!matches.length) return [];

    return matches.flatMap((match) =>
        String(match[1])
            .split(',')
            .map((pair) => String(pair).trim().split(/\s+/).map(Number))
            .filter((parts) => parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]))
            .map((parts) => [parts[0], parts[1]])
    );
}

function extractRouteGeometry(input) {
    if (!input) return [];

    if (Array.isArray(input)) {
        if (input.length && Array.isArray(input[0])) {
            return input
                .map((item) => {
                    const lon = Number(item[0]);
                    const lat = Number(item[1]);
                    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
                })
                .filter(Boolean);
        }

        return input.flatMap((item) => extractRouteGeometry(item));
    }

    if (typeof input === 'string') {
        return parseWktLineString(input);
    }

    if (typeof input === 'object') {
        const candidates = [
            input.selection,
            input.geometry,
            input.full_geometry,
            input.overview_geometry,
            input.outcoming_path,
            input.begin_pedestrian_path,
            input.end_pedestrian_path,
            input.route,
            input.routes,
            input.result,
            input.features,
            input.maneuvers,
            input.sections,
            input.alternatives,
            input.route_points,
            input.waypoints
        ];

        for (const candidate of candidates) {
            const coords = extractRouteGeometry(candidate);
            if (coords.length) return coords;
        }
    }

    return [];
}

function compactRouteGeometry(points) {
    const result = [];
    let prevKey = '';

    for (const point of points) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const lon = Number(point[0]);
        const lat = Number(point[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

        const key = `${lon.toFixed(6)}:${lat.toFixed(6)}`;
        if (key === prevKey) continue;
        prevKey = key;
        result.push([lon, lat]);
    }

    return result;
}

function haversineKm(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointToSegmentDistanceKm(point, start, end) {
    const meanLat = ((point[1] + start[1] + end[1]) / 3) * Math.PI / 180;
    const kmPerDegLat = 111.32;
    const kmPerDegLon = 111.32 * Math.cos(meanLat);

    const px = point[0] * kmPerDegLon;
    const py = point[1] * kmPerDegLat;
    const ax = start[0] * kmPerDegLon;
    const ay = start[1] * kmPerDegLat;
    const bx = end[0] * kmPerDegLon;
    const by = end[1] * kmPerDegLat;

    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;

    if (!lengthSq) return haversineKm(point, start);

    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    const closest = [
        (ax + t * dx) / kmPerDegLon,
        (ay + t * dy) / kmPerDegLat
    ];

    return haversineKm(point, closest);
}

function distanceToRouteKm(point, routeCoords) {
    if (!Array.isArray(routeCoords) || !routeCoords.length) return Infinity;
    if (routeCoords.length === 1) return haversineKm(point, routeCoords[0]);

    let minDistance = Infinity;
    for (let i = 1; i < routeCoords.length; i += 1) {
        const distance = pointToSegmentDistanceKm(point, routeCoords[i - 1], routeCoords[i]);
        if (distance < minDistance) minDistance = distance;
    }

    return minDistance;
}
function resolveLoadPickupPoint(load) {
    const lat = Number(load?.lat);
    const lng = Number(load?.lng);

    if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180 &&
        !(lat === 0 && lng === 0)
    ) {
        return [lng, lat];
    }

    return resolveRouteCityCoords(load?.from_location);
}

async function findLoadsAlongRoute(routeCoords, excludeLoadId) {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2) {
        return [];
    }

    const params = [];
    let sql = `
        SELECT
            id,
            from_location,
            to_location,
            weight,
            type,
            price,
            date,
            status,
            lat,
            lng
        FROM loads
        WHERE status = 'open'
    `;

    if (excludeLoadId && Number.isFinite(Number(excludeLoadId))) {
        params.push(Number(excludeLoadId));
        sql += ` AND id <> $1`;
    }

    sql += ` ORDER BY id DESC LIMIT 300`;

    const rows = await getMany(sql, params);

    return rows
        .map((load) => {
            const pickupPoint = resolveLoadPickupPoint(load);
            if (!pickupPoint) return null;

            const distanceKm = distanceToRouteKm(pickupPoint, routeCoords);
            if (!Number.isFinite(distanceKm) || distanceKm > 90) {
                return null;
            }

            return {
                ...load,
                pickup_point: { lon: pickupPoint[0], lat: pickupPoint[1] },
                route_distance_km: Number(distanceKm.toFixed(1)),
                recommendation_reason:
                    distanceKm <= 8
                        ? 'Груз почти на маршруте'
                        : distanceKm <= 20
                            ? 'Груз рядом с маршрутом'
                            : 'Груз можно забрать с небольшим отклонением'
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.route_distance_km - b.route_distance_km)
        .slice(0, 20);
}

app.post('/api/mobile/route', async (req, res) => {
  try {
    const { from, to, loadId } = req.body || {};

    if (
      !from ||
      !to ||
      typeof from.lon !== 'number' ||
      typeof from.lat !== 'number' ||
      typeof to.lon !== 'number' ||
      typeof to.lat !== 'number'
    ) {
      return res.status(400).json({ error: 'Некорректные координаты маршрута' });
    }

    const ROUTING_KEY = process.env.DGIS_ROUTING_KEY || process.env.DGIS_API_KEY;

    if (!ROUTING_KEY) {
      return res.status(500).json({ error: 'Не задан DGIS_ROUTING_KEY на сервере' });
    }

    const response = await fetch(
      `https://routing.api.2gis.com/routing/7.0.0/global?key=${encodeURIComponent(ROUTING_KEY)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          points: [
            {
              type: 'stop',
              lon: from.lon,
              lat: from.lat,
            },
            {
              type: 'stop',
              lon: to.lon,
              lat: to.lat,
            },
          ],
          transport: 'driving',
          route_mode: 'fastest',
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.message || data?.error || `Routing API error ${response.status}`,
        details: data,
      });
    }

    const routes = Array.isArray(data?.routes)
      ? data.routes
      : Array.isArray(data?.result)
        ? data.result
        : [];
    const firstRoute = routes[0];

    if (!firstRoute) {
      return res.status(404).json({ error: 'Маршрут не найден', details: data });
    }

    // Пытаемся вытащить геометрию из разных возможных мест ответа
    const rawGeometry =
      firstRoute?.geometry ||
      firstRoute?.full_geometry ||
      firstRoute?.overview_geometry ||
      firstRoute?.maneuvers ||
      firstRoute?.sections ||
      null;

    const geometry = compactRouteGeometry(extractRouteGeometry(rawGeometry));

    if (geometry.length < 2) {
      return res.status(500).json({
        error: '2GIS не вернул геометрию маршрута',
        details: firstRoute,
      });
    }

    const nearbyLoads = await findLoadsAlongRoute(geometry, loadId);

    return res.json({
      ok: true,
      route: firstRoute,
      geometry,
      nearby_loads: nearbyLoads,
      summary: {
        distance_meters: firstRoute?.distance || firstRoute?.total_distance || null,
        duration_seconds: firstRoute?.duration || firstRoute?.total_duration || null,
      },
    });
  } catch (error) {
    console.error('Ошибка /api/mobile/route:', error);
    return res.status(500).json({
      error: 'Не удалось построить маршрут',
      details: error.message,
    });
  }
});

app.get('/api/admin/session', async (req, res) => {
    try {
        if (req.session?.isAdmin) {
            return res.json({ ok: true, isAdmin: true, usingDefaultPassword: getAdminPassword() === DEFAULT_ADMIN_PASSWORD });
        }

        const adminEmails = getAdminEmails();
        if (req.session?.userId && adminEmails.length) {
            const user = await getOne('SELECT email FROM users WHERE id = $1', [req.session.userId]);
            if (user?.email && adminEmails.includes(String(user.email).toLowerCase())) {
                req.session.isAdmin = true;
                return res.json({ ok: true, isAdmin: true, usingDefaultPassword: getAdminPassword() === DEFAULT_ADMIN_PASSWORD });
            }
        }

        res.json({ ok: true, isAdmin: false, usingDefaultPassword: getAdminPassword() === DEFAULT_ADMIN_PASSWORD });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/login', checkAdminLoginThrottle, async (req, res) => {
    const password = String(req.body?.password || '');
    const hash = process.env.ADMIN_PASSWORD_HASH;

    try {
        const ok = hash
            ? await bcrypt.compare(password, hash)
            : password === getAdminPassword();

        if (!ok) {
            recordAdminLoginFailure(req);
            return res.status(403).json({ error: 'Неверный пароль администратора' });
        }

        clearAdminLoginAttempts(req);
        req.session.isAdmin = true;
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/logout', checkAdmin, (req, res) => {
    req.session.isAdmin = false;
    res.json({ ok: true });
});

app.get('/api/admin/summary', checkAdmin, async (req, res) => {
    try {
        const loads = await getOne(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'open')::int AS open,
                COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE "clientCompleted" = true AND "carrierCompleted" = false)::int AS waiting_carrier,
                COUNT(*) FILTER (WHERE "clientCompleted" = false AND "carrierCompleted" = true)::int AS waiting_owner
            FROM loads
        `);
        const offers = await getOne(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
                COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
            FROM offers
        `);
        const users = await getOne(`SELECT COUNT(*)::int AS total FROM users`);
        const wallets = await getOne(`
            SELECT
                COALESCE(SUM(balance), 0)::float AS balance,
                COALESCE(SUM("heldBalance"), 0)::float AS "heldBalance"
            FROM wallets
        `);
        const escrows = await getOne(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'held')::int AS held,
                COUNT(*) FILTER (WHERE status = 'released')::int AS released,
                COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded
            FROM escrows
        `);
        res.json({ loads, offers, users, wallets, escrows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/topup-requests', checkAdmin, async (req, res) => {
    const status = String(req.query.status || 'pending');
    const params = [];
    const where = [];
    if (status && status !== 'all') {
        params.push(status);
        where.push(`wallet_topup_requests.status = $${params.length}`);
    }

    try {
        const rows = await getMany(
            `SELECT wallet_topup_requests.id, wallet_topup_requests."userId", wallet_topup_requests.amount::float AS amount,
                    wallet_topup_requests.currency, wallet_topup_requests.status, wallet_topup_requests."receiptFile",
                    wallet_topup_requests."receiptOriginalName", wallet_topup_requests."adminComment",
                    wallet_topup_requests."createdAt", wallet_topup_requests."reviewedAt",
                    users.name, users.email, users.phone, users.company, users.role, users.user_code
             FROM wallet_topup_requests
             JOIN users ON users.id = wallet_topup_requests."userId"
             ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY wallet_topup_requests.id DESC
             LIMIT 120`,
            params
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/topup-requests/:id/approve', checkAdmin, async (req, res) => {
    const requestId = req.params.id;
    const comment = String(req.body?.comment || '').trim();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `SELECT * FROM wallet_topup_requests WHERE id = $1 FOR UPDATE`,
            [requestId]
        );
        const request = result.rows[0];
        if (!request) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '\u0417\u0430\u044f\u0432\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430' });
        }
        if (request.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '\u0417\u0430\u044f\u0432\u043a\u0430 \u0443\u0436\u0435 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u0430' });
        }

        const wallet = await ensureWallet(client, request.userId, { lock: true });
        const amount = toMoney(request.amount);
        await client.query(
            `UPDATE wallets SET balance = balance + $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2`,
            [amount, request.userId]
        );
        await client.query(
            `UPDATE wallet_topup_requests
             SET status = 'approved', "adminComment" = $1, "reviewedBy" = $2, "reviewedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [comment, req.session.userId || null, requestId]
        );
        await addWalletTransaction(client, {
            userId: request.userId,
            type: 'manual_topup',
            amount,
            currency: wallet.currency || 'KZT',
            description: comment || '\u041f\u043e\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435 \u0431\u0430\u043b\u0430\u043d\u0441\u0430 \u043f\u043e \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u0438 #' + requestId,
            providerPaymentId: 'topup_request_' + requestId
        });
        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/admin/topup-requests/:id/reject', checkAdmin, async (req, res) => {
    const requestId = req.params.id;
    const comment = String(req.body?.comment || '').trim();
    try {
        const result = await query(
            `UPDATE wallet_topup_requests
             SET status = 'rejected', "adminComment" = $1, "reviewedBy" = $2, "reviewedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $3 AND status = 'pending'
             RETURNING id`,
            [comment, req.session.userId || null, requestId]
        );
        if (!result.rows[0]) return res.status(400).json({ error: '\u0417\u0430\u044f\u0432\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430 \u0438\u043b\u0438 \u0443\u0436\u0435 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u0430' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/withdraw-requests', checkAdmin, async (req, res) => {
    const status = String(req.query.status || 'pending');
    const params = []; const where = [];
    if (status && status !== 'all') { params.push(status); where.push(`wallet_withdraw_requests.status = $${params.length}`); }
    try {
        const rows = await getMany(`SELECT wallet_withdraw_requests.id, wallet_withdraw_requests."userId", wallet_withdraw_requests.amount::float AS amount, wallet_withdraw_requests.currency, wallet_withdraw_requests.status, wallet_withdraw_requests."payoutDetails", wallet_withdraw_requests."adminComment", wallet_withdraw_requests."createdAt", wallet_withdraw_requests."reviewedAt", users.name, users.email, users.phone, users.company, users.role, users.user_code FROM wallet_withdraw_requests JOIN users ON users.id = wallet_withdraw_requests."userId" ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY wallet_withdraw_requests.id DESC LIMIT 120`, params);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/withdraw-requests/:id/approve', checkAdmin, async (req, res) => {
    const requestId = req.params.id; const comment = String(req.body?.comment || '').trim();
    try {
        const result = await query('UPDATE wallet_withdraw_requests SET status = $1, "adminComment" = $2, "reviewedBy" = $3, "reviewedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $4 AND status = $5 RETURNING id', ['approved', comment, req.session.userId || null, requestId, 'pending']);
        if (!result.rows[0]) return res.status(400).json({ error: '\u0417\u0430\u044f\u0432\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430 \u0438\u043b\u0438 \u0443\u0436\u0435 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u0430' });
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/withdraw-requests/:id/reject', checkAdmin, async (req, res) => {
    const requestId = req.params.id; const comment = String(req.body?.comment || '').trim(); const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('SELECT * FROM wallet_withdraw_requests WHERE id = $1 FOR UPDATE', [requestId]);
        const request = result.rows[0];
        if (!request || request.status !== 'pending') { await client.query('ROLLBACK'); return res.status(400).json({ error: '\u0417\u0430\u044f\u0432\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430 \u0438\u043b\u0438 \u0443\u0436\u0435 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u0430' }); }
        const wallet = await ensureWallet(client, request.userId, { lock: true });
        const amount = toMoney(request.amount);
        await client.query('UPDATE wallets SET balance = balance + $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2', [amount, request.userId]);
        await client.query('UPDATE wallet_withdraw_requests SET status = $1, "adminComment" = $2, "reviewedBy" = $3, "reviewedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $4', ['rejected', comment, req.session.userId || null, requestId]);
        await addWalletTransaction(client, { userId: request.userId, type: 'withdraw_refund', amount, currency: wallet.currency || 'KZT', description: '\u0412\u043e\u0437\u0432\u0440\u0430\u0442 \u043f\u043e \u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043d\u043e\u0439 \u0437\u0430\u044f\u0432\u043a\u0435 \u043d\u0430 \u0432\u044b\u0432\u043e\u0434 #' + requestId });
        await client.query('COMMIT'); res.json({ ok: true });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); } finally { client.release(); }
});
app.get('/api/admin/wallets', checkAdmin, async (req, res) => {
    const search = String(req.query.search || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);
    const params = [];
    const where = [];

    if (search) {
        params.push(`%${search}%`);
        where.push(`(
            users.id::text ILIKE $${params.length}
            OR users.user_code ILIKE $${params.length}
            OR users.name ILIKE $${params.length}
            OR users.email ILIKE $${params.length}
            OR users.phone ILIKE $${params.length}
            OR users.company ILIKE $${params.length}
        )`);
    }

    params.push(limit);

    try {
        const rows = await getMany(`
            SELECT
                users.id,
                users.name,
                users.email,
                users.phone,
                users.company,
                users.role,
                users.person_type,
                users.user_code,
                COALESCE(wallets.balance, 0)::float AS balance,
                COALESCE(wallets."heldBalance", 0)::float AS "heldBalance",
                COALESCE(wallets.currency, 'KZT') AS currency,
                COALESCE(load_stats.total_loads, 0)::int AS "totalLoads",
                COALESCE(load_stats.active_loads, 0)::int AS "activeLoads"
            FROM users
            LEFT JOIN wallets ON wallets."userId" = users.id
            LEFT JOIN (
                SELECT
                    "userId",
                    COUNT(*) AS total_loads,
                    COUNT(*) FILTER (WHERE COALESCE(status, 'open') <> 'completed') AS active_loads
                FROM loads
                GROUP BY "userId"
            ) load_stats ON load_stats."userId" = users.id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY users.id DESC
            LIMIT $${params.length}
        `, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/wallets/:userId', checkAdmin, async (req, res) => {
    const userId = req.params.userId;

    try {
        const user = await getOne(
            `SELECT id, name, email, phone, company, role, person_type, user_code FROM users WHERE id = $1`,
            [userId]
        );
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

        const wallet = await ensureWallet(pool, userId);
        const transactions = await getMany(
            `SELECT id, type, amount::float AS amount, currency, status, description, "loadId", "offerId", "escrowId", "createdAt"
             FROM wallet_transactions
             WHERE "userId" = $1
             ORDER BY id DESC
             LIMIT 50`,
            [userId]
        );
        const escrows = await getMany(
            `SELECT id, "loadId", "offerId", amount::float AS amount, "carrierAmount"::float AS "carrierAmount",
                    "commissionAmount"::float AS "commissionAmount", currency, status, "createdAt", "releasedAt", "refundedAt"
             FROM escrows
             WHERE "ownerUserId" = $1 OR "carrierUserId" = $1
             ORDER BY id DESC
             LIMIT 30`,
            [userId]
        );

        res.json({
            user,
            wallet: {
                balance: toMoney(wallet.balance),
                heldBalance: toMoney(wallet.heldBalance),
                currency: wallet.currency || 'KZT'
            },
            transactions,
            escrows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/wallets/:userId/adjust', checkAdmin, async (req, res) => {
    const userId = req.params.userId;
    const direction = String(req.body?.direction || '').trim();
    const amount = toMoney(req.body?.amount);
    const description = String(req.body?.description || '').trim() || 'Ручная операция администратора';

    if (!['credit', 'debit'].includes(direction)) {
        return res.status(400).json({ error: 'Выберите тип операции: credit или debit' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Сумма должна быть больше 0' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const userResult = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (!userResult.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const wallet = await ensureWallet(client, userId, { lock: true });
        const currentBalance = toMoney(wallet.balance);
        if (direction === 'debit' && currentBalance < amount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Недостаточно денег на доступном балансе', wallet: { balance: currentBalance, required: amount } });
        }

        const signedAmount = direction === 'credit' ? amount : -amount;
        await client.query(
            `UPDATE wallets SET balance = balance + $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2`,
            [signedAmount, userId]
        );
        await addWalletTransaction(client, {
            userId,
            type: direction === 'credit' ? 'admin_credit' : 'admin_debit',
            amount: signedAmount,
            currency: wallet.currency || 'KZT',
            description
        });

        await client.query('COMMIT');
        res.json({ ok: true, wallet: await getWalletPayload(userId) });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});
app.get('/api/admin/loads', checkAdmin, async (req, res) => {
    const status = String(req.query.status || 'all');
    const search = String(req.query.search || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);
    const params = [];
    const where = [];

    if (status && status !== 'all') {
        params.push(status);
        where.push(`COALESCE(loads.status, 'open') = $${params.length}`);
    }

    if (search) {
        params.push(`%${search}%`);
        where.push(`(
            loads.id::text ILIKE $${params.length}
            OR loads.from_location ILIKE $${params.length}
            OR loads.to_location ILIKE $${params.length}
            OR loads.type ILIKE $${params.length}
            OR owner.name ILIKE $${params.length}
            OR owner.email ILIKE $${params.length}
            OR owner.phone ILIKE $${params.length}
            OR carrier.name ILIKE $${params.length}
            OR carrier.email ILIKE $${params.length}
            OR carrier.phone ILIKE $${params.length}
        )`);
    }

    params.push(limit);

    try {
        const rows = await getMany(`
            ${getAdminLoadSelectSql()}
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY loads.id DESC
            LIMIT $${params.length}
        `, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/loads/:id', checkAdmin, async (req, res) => {
    try {
        const load = await getAdminLoad(req.params.id);
        if (!load) return res.status(404).json({ error: 'Груз не найден' });
        const offers = await getAdminLoadOffers(req.params.id);
        res.json({ load, offers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/admin/loads/:id', checkAdmin, async (req, res) => {
    const allowed = {
        from_location: 'from_location',
        to_location: 'to_location',
        weight: 'weight',
        type: 'type',
        price: 'price',
        date: 'date',
        lat: 'lat',
        lng: 'lng',
        contact_info: 'contact_info',
        volume: 'volume',
        length: 'length',
        width: 'width',
        height: 'height',
        loading_type: 'loading_type',
        description: 'description',
        status: 'status',
        clientCompleted: '"clientCompleted"',
        carrierCompleted: '"carrierCompleted"'
    };
    const allowedStatuses = new Set(['open', 'assigned', 'completed', 'cancelled', 'archived']);
    const sets = [];
    const params = [];

    Object.entries(allowed).forEach(([key, column]) => {
        if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) return;
        if (key === 'status' && !allowedStatuses.has(String(req.body[key]))) return;
        params.push(req.body[key]);
        sets.push(`${column} = $${params.length}`);
    });

    if (!sets.length) return res.status(400).json({ error: 'Нет полей для обновления' });

    params.push(req.params.id);

    try {
        await query(`UPDATE loads SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
        res.json({ ok: true, load: await getAdminLoad(req.params.id) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/loads/:id/unassign', checkAdmin, async (req, res) => {
    const loadId = req.params.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const loadResult = await client.query('SELECT id FROM loads WHERE id = $1 FOR UPDATE', [loadId]);
        if (!loadResult.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Груз не найден' });
        }

        await refundEscrowForLoad(client, loadId, 'Админ снял назначение перевозчика');
        await client.query(`UPDATE offers SET status = 'pending' WHERE "loadId" = $1 AND status = 'accepted'`, [loadId]);
        await client.query(
            `UPDATE loads
             SET status = 'open',
                 "clientCompleted" = false,
                 "carrierCompleted" = false,
                 "clientCompletedAt" = NULL,
                 "carrierCompletedAt" = NULL
             WHERE id = $1`,
            [loadId]
        );
        await client.query('DELETE FROM carrier_locations WHERE "loadId" = $1', [loadId]);
        await client.query('COMMIT');
        res.json({ ok: true, load: await getAdminLoad(loadId) });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    } finally {
        client.release();
    }
});

app.post('/api/admin/loads/:id/refund', checkAdmin, async (req, res) => {
    const loadId = req.params.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const loadResult = await client.query('SELECT id FROM loads WHERE id = $1 FOR UPDATE', [loadId]);
        if (!loadResult.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Груз не найден' });
        }

        const escrow = await refundEscrowForLoad(client, loadId, 'Админ вернул замороженные деньги владельцу');
        if (!escrow) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'По этому грузу нет замороженных денег для возврата' });
        }

        await client.query(`UPDATE offers SET status = 'pending' WHERE "loadId" = $1 AND status = 'accepted'`, [loadId]);
        await client.query(
            `UPDATE loads
             SET status = 'open',
                 "clientCompleted" = false,
                 "carrierCompleted" = false,
                 "clientCompletedAt" = NULL,
                 "carrierCompletedAt" = NULL
             WHERE id = $1`,
            [loadId]
        );
        await client.query('DELETE FROM carrier_locations WHERE "loadId" = $1', [loadId]);
        await client.query('COMMIT');

        res.json({ ok: true, escrow, load: await getAdminLoad(loadId) });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    } finally {
        client.release();
    }
});
app.post('/api/admin/loads/:id/complete', checkAdmin, async (req, res) => {
    const loadId = req.params.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const loadResult = await client.query('SELECT id FROM loads WHERE id = $1 FOR UPDATE', [loadId]);
        if (!loadResult.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Груз не найден' });
        }

        await client.query(
            `UPDATE loads
             SET status = 'completed',
                 "clientCompleted" = true,
                 "carrierCompleted" = true,
                 "clientCompletedAt" = COALESCE("clientCompletedAt", CURRENT_TIMESTAMP),
                 "carrierCompletedAt" = COALESCE("carrierCompletedAt", CURRENT_TIMESTAMP)
             WHERE id = $1`,
            [loadId]
        );
        const escrow = await releaseEscrowForLoad(client, loadId);
        await client.query('COMMIT');
        res.json({ ok: true, escrow, load: await getAdminLoad(loadId) });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    } finally {
        client.release();
    }
});

app.post('/api/admin/loads/:id/reopen', checkAdmin, async (req, res) => {
    try {
        await query(
            `UPDATE loads
             SET status = 'open',
                 "clientCompleted" = false,
                 "carrierCompleted" = false,
                 "clientCompletedAt" = NULL,
                 "carrierCompletedAt" = NULL
             WHERE id = $1`,
            [req.params.id]
        );
        res.json({ ok: true, load: await getAdminLoad(req.params.id) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/loads/:id', checkAdmin, async (req, res) => {
    const loadId = req.params.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const loadResult = await client.query('SELECT id FROM loads WHERE id = $1 FOR UPDATE', [loadId]);
        if (!loadResult.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Груз не найден' });
        }
        await refundEscrowForLoad(client, loadId, 'Админ удалил груз');
        await client.query('DELETE FROM loads WHERE id = $1', [loadId]);
        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    } finally {
        client.release();
    }
});

app.post('/api/admin/offers/:id/accept', checkAdmin, async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await acceptOfferAsAdmin(client, req.params.id);
        await client.query('COMMIT');
        res.json({ ok: true, ...result, load: await getAdminLoad(result.loadId) });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    } finally {
        client.release();
    }
});

app.patch('/api/admin/offers/:id/status', checkAdmin, async (req, res) => {
    const status = String(req.body?.status || '');
    const allowed = new Set(['pending', 'accepted', 'rejected']);
    if (!allowed.has(status)) return res.status(400).json({ error: 'Некорректный статус ставки' });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (status === 'accepted') {
            const result = await acceptOfferAsAdmin(client, req.params.id);
            await client.query('COMMIT');
            return res.json({ ok: true, ...result, load: await getAdminLoad(result.loadId) });
        }

        const offerResult = await client.query('SELECT * FROM offers WHERE id = $1 FOR UPDATE', [req.params.id]);
        const offer = offerResult.rows[0];
        if (!offer) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Ставка не найдена' });
        }

        if (offer.status === 'accepted') {
            await refundEscrowForLoad(client, offer.loadId, 'Админ изменил статус принятой ставки');
            await client.query(
                `UPDATE loads
                 SET status = 'open',
                     "clientCompleted" = false,
                     "carrierCompleted" = false,
                     "clientCompletedAt" = NULL,
                     "carrierCompletedAt" = NULL
                 WHERE id = $1`,
                [offer.loadId]
            );
        }

        await client.query('UPDATE offers SET status = $1 WHERE id = $2', [status, req.params.id]);
        await client.query('COMMIT');
        res.json({ ok: true, load: await getAdminLoad(offer.loadId) });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/offers/:id', checkAdmin, async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const offerResult = await client.query('SELECT * FROM offers WHERE id = $1 FOR UPDATE', [req.params.id]);
        const offer = offerResult.rows[0];
        if (!offer) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Ставка не найдена' });
        }

        if (offer.status === 'accepted') {
            await refundEscrowForLoad(client, offer.loadId, 'Админ удалил принятую ставку');
            await client.query(
                `UPDATE loads
                 SET status = 'open',
                     "clientCompleted" = false,
                     "carrierCompleted" = false,
                     "clientCompletedAt" = NULL,
                     "carrierCompletedAt" = NULL
                 WHERE id = $1`,
                [offer.loadId]
            );
        }

        await client.query('DELETE FROM offers WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.json({ ok: true, loadId: offer.loadId });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    } finally {
        client.release();
    }
});
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
});

// --- 3. РАБОТА С ГРУЗАМИ ---

app.post('/api/loads', checkAuth, async (req, res) => {
    const userId = req.session.userId;
    const payload = validateLoadPayload(req.body || {});

    if (!payload.ok) {
        return res.status(400).json({ error: payload.error });
    }

    const load = payload.value;

    try {
        const user = await getOne('SELECT phone FROM users WHERE id = $1', [userId]);
        const contact = (user && user.phone) ? user.phone : 'Контакт не указан';

        const result = await query(
            `INSERT INTO loads (
                "userId", from_location, to_location, weight, type, price, date, lat, lng,
                contact_info, volume, length, width, height, loading_type, description
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id`,
            [
                userId,
                load.from_location,
                load.to_location,
                load.weight,
                load.type,
                load.price,
                load.ready_date,
                load.lat,
                load.lng,
                contact,
                load.volume,
                load.length,
                load.width,
                load.height,
                load.loading_type,
                load.description
            ]
        );

        res.json({ success: true, loadId: result.rows[0].id });
    } catch (err) {
        console.error('/api/loads POST error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/loads', async (req, res) => {
    try {
        const rows = await getMany("SELECT * FROM loads WHERE COALESCE(status, 'open') = 'open' ORDER BY id DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/:id/public', checkAuth, async (req, res) => {
    const userId = Number(req.params.id);

    if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ error: '\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c' });
    }

    try {
        const user = await getOne(
            `SELECT
                users.id,
                users.name,
                users.phone,
                users.company,
                users.role,
                users.person_type,
                users.user_code,
                users.iin,
                users.ecp_verified,
                COALESCE(review_stats.average_rating, 0) AS "averageRating",
                COALESCE(review_stats.total_count, 0) AS "totalReviews",
                COALESCE(load_stats.active_count, 0) AS "activeLoads",
                COALESCE(load_stats.completed_count, 0) AS "completedLoads"
             FROM users
             LEFT JOIN (
                SELECT "revieweeId", AVG(rating)::float AS average_rating, COUNT(*)::int AS total_count
                FROM reviews
                WHERE "revieweeId" = $1
                GROUP BY "revieweeId"
             ) review_stats ON review_stats."revieweeId" = users.id
             LEFT JOIN (
                SELECT "userId", COUNT(*) FILTER (WHERE COALESCE(status, 'open') <> 'completed')::int AS active_count,
                       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count
                FROM loads
                WHERE "userId" = $1
                GROUP BY "userId"
             ) load_stats ON load_stats."userId" = users.id
             WHERE users.id = $1`,
            [userId]
        );

        if (!user) return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });

        const reviews = await getMany(
            `SELECT
                reviews.id,
                reviews.rating,
                reviews.text,
                reviews."createdAt",
                reviews."loadId",
                COALESCE(reviewer.name, reviewer.company, '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c') AS "authorName",
                reviewer.role AS "authorRole",
                CASE
                    WHEN loads.id IS NULL THEN CONCAT('\u0421\u0434\u0435\u043b\u043a\u0430 #', reviews."loadId")
                    WHEN NULLIF(loads.from_location, '') IS NULL AND NULLIF(loads.to_location, '') IS NULL THEN CONCAT('\u0421\u0434\u0435\u043b\u043a\u0430 #', reviews."loadId")
                    ELSE CONCAT(COALESCE(NULLIF(loads.from_location, ''), '\u041c\u0430\u0440\u0448\u0440\u0443\u0442'), ' \u2192 ', COALESCE(NULLIF(loads.to_location, ''), '\u041c\u0430\u0440\u0448\u0440\u0443\u0442'))
                END AS "loadRoute"
             FROM reviews
             LEFT JOIN users reviewer ON reviewer.id = reviews."reviewerId"
             LEFT JOIN loads ON loads.id = reviews."loadId"
             WHERE reviews."revieweeId" = $1
             ORDER BY reviews."createdAt" DESC
             LIMIT 20`,
            [userId]
        );

        const averageRating = Number(user.averageRating || 0);
        res.json({
            ...user,
            averageRating: Math.round(averageRating * 100) / 100,
            reviews
        });
    } catch (err) {
        console.error('/api/users/:id/public error:', err);
        res.status(500).json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430' });
    }
});

app.get('/api/loads/:id', async (req, res) => {
    const loadId = req.params.id;
    const currentUser = getRequestUser(req);

    if (!currentUser?.userId) {
        return res.status(401).json({ error: 'Необходима авторизация' });
    }

    const sql = `
        SELECT
            loads.*,
            users.name AS client_name,
            users.phone AS client_phone,
            users.company AS client_company,
            users.person_type AS client_person_type,
            users.user_code AS client_code,
            users.iin AS client_iin,
            users.ecp_verified AS client_ecp_verified,
            COALESCE(review_stats.average_rating, 0) AS client_rating,
            COALESCE(review_stats.total_count, 0) AS client_reviews_count,
            offers."carrierUserId" AS "carrierUserId",
            offers."carrierName" AS "carrierName",
            offers."carrierPhone" AS "carrierPhone",
            loads."clientCompleted" AS "clientCompleted",
            loads."carrierCompleted" AS "carrierCompleted",
            loads."clientCompletedAt" AS "clientCompletedAt",
            loads."carrierCompletedAt" AS "carrierCompletedAt"
        FROM loads
        JOIN users ON users.id = loads."userId"
        LEFT JOIN (
            SELECT "revieweeId", AVG(rating)::float AS average_rating, COUNT(*)::int AS total_count
            FROM reviews
            GROUP BY "revieweeId"
        ) review_stats ON review_stats."revieweeId" = users.id
        LEFT JOIN offers
            ON offers."loadId" = loads.id
        AND offers.status = 'accepted'
        WHERE loads.id = $1
    `;

    try {
        const row = await getOne(sql, [loadId]);
        if (!row) return res.status(404).json({ error: 'Груз не найден' });

        const currentUserId = Number(currentUser.userId);
        const ownerId = Number(row.userId);
        const acceptedCarrierId = row.carrierUserId !== null && row.carrierUserId !== undefined
            ? Number(row.carrierUserId)
            : null;
        const canViewContacts = currentUserId === ownerId || currentUserId === acceptedCarrierId;

        if (!canViewContacts) {
            row.client_phone = undefined;
            row.contact_info = undefined;
            row.carrierPhone = undefined;
        }

        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/offers', checkAuth, async (req, res) => {
    const carrierUserId = req.session.userId;
    const { loadId, price, currency, pickupDate, truckType, comment } = req.body;

    try {
        const user = await getOne('SELECT name, phone, role FROM users WHERE id = $1', [carrierUserId]);
        if (!user) return res.status(400).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });

        if (user.role !== 'carrier') {
            return res.status(403).json({ error: '\u0421\u0442\u0430\u0432\u043a\u0438 \u043c\u043e\u0433\u0443\u0442 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0438' });
        }

        const load = await getOne(`
            SELECT loads.*, users.email AS "ownerEmail", users.name AS "ownerName"
            FROM loads
            JOIN users ON users.id = loads."userId"
            WHERE loads.id = $1
        `, [loadId]);
        if (!load) return res.status(404).json({ error: 'Груз не найден' });

        if (Number(load.userId) === Number(carrierUserId)) {
            return res.status(400).json({ error: '\u041d\u0435\u043b\u044c\u0437\u044f \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0430\u0432\u043a\u0443 \u043d\u0430 \u0441\u0432\u043e\u0439 \u0433\u0440\u0443\u0437' });
        }
        const existingOffer = await getOne(
            `SELECT * FROM offers WHERE "loadId" = $1 AND "carrierUserId" = $2 ORDER BY id DESC LIMIT 1`,
            [loadId, carrierUserId]
        );
        if (existingOffer) {
            return res.status(409).json({
                error: '\u0432\u044b \u0443\u0436\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u043b\u0438 \u0441\u0442\u0430\u0432\u043a\u0443, \u0445\u043e\u0442\u0438\u0442\u0435 \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u044c?',
                duplicateOffer: true,
                offerId: existingOffer.id,
                offer: existingOffer
            });
        }
        const result = await query(
            `INSERT INTO offers (
                "loadId", "carrierUserId", "carrierName", "carrierPhone", price, currency, "pickupDate", "truckType", comment, status
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
             RETURNING id`,
            [
                loadId,
                carrierUserId,
                user.name || 'Перевозчик',
                user.phone || '',
                price,
                currency || 'KZT',
                pickupDate || '',
                truckType || '',
                comment || ''
            ]
        );

        const offerId = result.rows[0].id;

        try {
            await sendOfferNotificationEmail({
            loadId,
            offerId,
            ownerEmail: load.ownerEmail,
            ownerName: load.ownerName,
            load,
            carrier: user,
            offer: { price, currency: currency || 'KZT', pickupDate: pickupDate || '', truckType: truckType || '', comment: comment || '' }
        });
        } catch (emailErr) {
            console.error('Offer notification email failed:', emailErr);
        }

        await sendExpoPushNotifications([load.userId], {
            title: '\u041d\u043e\u0432\u0430\u044f \u0441\u0442\u0430\u0432\u043a\u0430',
            body: makeOfferPushBody(load, user, price, currency || 'KZT'),
            data: { type: 'offer_created', loadId: String(loadId), offerId: String(offerId) }
        });

        res.json({ ok: true, offerId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/loads/:id/offers', checkAuth, async (req, res) => {
    const loadId = req.params.id;
    const ownerId = req.session.userId;

    try {
        const load = await getOne(`SELECT * FROM loads WHERE id = $1`, [loadId]);
        if (!load) return res.status(404).json({ error: 'Груз не найден' });
        if (Number(load.userId) !== Number(ownerId)) {
            return res.status(403).json({ error: 'Нет доступа' });
        }

        const rows = await getMany(
            `SELECT * FROM offers WHERE "loadId" = $1 ORDER BY id DESC`,
            [loadId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/offers/:id/accept', checkAuth, async (req, res) => {
    const offerId = req.params.id;
    const ownerId = req.session.userId;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const offerResult = await client.query(`SELECT * FROM offers WHERE id = $1 FOR UPDATE`, [offerId]);
        const offer = offerResult.rows[0];
        if (!offer) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Ставка не найдена' });
        }

        const loadResult = await client.query(
            `SELECT * FROM loads WHERE id = $1 AND "userId" = $2 FOR UPDATE`,
            [offer.loadId, ownerId]
        );
        const load = loadResult.rows[0];
        if (!load) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Нет доступа к грузу' });
        }

        const carrierResult = await client.query('SELECT email, name FROM users WHERE id = $1', [offer.carrierUserId]);
        const acceptedCarrier = carrierResult.rows[0] || {};
        const ownerResult = await client.query('SELECT name FROM users WHERE id = $1', [ownerId]);
        const loadOwner = ownerResult.rows[0] || {};

        const escrow = await holdEscrowForAcceptedOffer(client, { load, offer, ownerId });

        await client.query(`UPDATE offers SET status = 'rejected' WHERE "loadId" = $1`, [offer.loadId]);
        await client.query(`UPDATE offers SET status = 'accepted' WHERE id = $1`, [offerId]);
        await cancelCarrierPendingOffersAfterAcceptance(client, {
            carrierUserId: offer.carrierUserId,
            acceptedOfferId: offerId,
            acceptedLoadId: offer.loadId
        });
        await client.query(
            `UPDATE loads
             SET status = 'assigned',
                 "clientCompleted" = false,
                 "carrierCompleted" = false,
                 "clientCompletedAt" = NULL,
                 "carrierCompletedAt" = NULL
             WHERE id = $1`,
            [offer.loadId]
        );

        await client.query(
            `INSERT INTO chats ("loadId", "clientId", "carrierId")
             VALUES ($1, $2, $3)
             ON CONFLICT ("loadId", "carrierId") DO NOTHING`,
            [offer.loadId, ownerId, offer.carrierUserId]
        );

        await client.query('COMMIT');

        await sendOfferAcceptedNotificationEmail({
            carrierEmail: acceptedCarrier.email,
            carrierName: acceptedCarrier.name || offer.carrierName,
            ownerName: loadOwner.name,
            load,
            offer
        });

        await sendExpoPushNotifications([offer.carrierUserId], {
            title: '\u0421\u0442\u0430\u0432\u043a\u0430 \u043f\u0440\u0438\u043d\u044f\u0442\u0430',
            body: makeLoadStatusPushBody(load, '\u0412\u0430\u0448\u0443 \u0441\u0442\u0430\u0432\u043a\u0443 \u043f\u0440\u0438\u043d\u044f\u043b\u0438'),
            data: { type: 'offer_accepted', loadId: String(offer.loadId), offerId: String(offerId) }
        });

        res.json({ ok: true, escrow, wallet: await getWalletPayload(ownerId) });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    } finally {
        client.release();
    }
});
app.put('/api/offers/:id', checkAuth, async (req, res) => {
    const offerId = req.params.id;
    const userId = req.session.userId;
    const { price, currency, pickupDate, truckType, comment } = req.body;

    try {
        const offer = await getOne(`SELECT * FROM offers WHERE id = $1`, [offerId]);
        if (!offer) return res.status(404).json({ error: 'Ставка не найдена' });
        if (offer.carrierUserId !== userId) return res.status(403).json({ error: 'Нет доступа' });
        if (offer.status === 'accepted') return res.status(400).json({ error: 'Принятую ставку нельзя изменить' });
        if (String(offer.initiator || 'carrier') !== 'carrier') return res.status(400).json({ error: 'Предложенный груз нельзя изменить как ставку' });

        await query(
            `UPDATE offers
             SET price = $1, currency = $2, "pickupDate" = $3, "truckType" = $4, comment = $5, status = 'pending'
             WHERE id = $6`,
            [price, currency || 'KZT', pickupDate || '', truckType || '', comment || '', offerId]
        );

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/offers/:id', checkAuth, async (req, res) => {
    const offerId = req.params.id;
    const userId = req.session.userId;

    try {
        const offer = await getOne(`SELECT * FROM offers WHERE id = $1`, [offerId]);
        if (!offer) return res.status(404).json({ error: 'Ставка не найдена' });
        if (offer.carrierUserId !== userId) return res.status(403).json({ error: 'Нет доступа' });
        if (offer.status === 'accepted') return res.status(400).json({ error: 'Перевозчик может оставить отзыв только владельцу груза' });
        if (String(offer.initiator || 'carrier') !== 'carrier') return res.status(400).json({ error: 'Предложенный груз нельзя изменить как ставку' });

        await query(`DELETE FROM offers WHERE id = $1`, [offerId]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/loads/:id/unassign', checkAuth, async (req, res) => {
    const loadId = req.params.id;
    const ownerId = req.session.userId;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const loadResult = await client.query(
            `SELECT * FROM loads WHERE id = $1 AND "userId" = $2 FOR UPDATE`,
            [loadId, ownerId]
        );
        const load = loadResult.rows[0];
        if (!load) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Нет доступа к грузу' });
        }

        await refundEscrowForLoad(client, loadId, 'Оплата возвращена после снятия назначения');

        await client.query(`UPDATE offers SET status = 'pending' WHERE "loadId" = $1`, [loadId]);
        await client.query(
            `UPDATE loads
             SET status = 'open',
                 "clientCompleted" = false,
                 "carrierCompleted" = false,
                 "clientCompletedAt" = NULL,
                 "carrierCompletedAt" = NULL
             WHERE id = $1`,
            [loadId]
        );

        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message, wallet: err.wallet });
    } finally {
        client.release();
    }
});

app.post('/api/loads/:id/complete', checkAuth, async (req, res) => {
    const loadId = req.params.id;
    const userId = req.session.userId;

    try {
        const load = await getOne(
            `SELECT loads.*, offers.id AS "acceptedOfferId", offers."carrierUserId" AS "acceptedCarrierUserId"
             FROM loads
             LEFT JOIN offers ON offers."loadId" = loads.id AND offers.status = 'accepted'
             WHERE loads.id = $1`,
            [loadId]
        );

        if (!load) return res.status(404).json({ error: 'Груз не найден' });

       if (Number(load.userId) !== Number(userId) && !load.acceptedOfferId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }

        if (load.status !== 'assigned') {
            return res.status(400).json({ error: 'Можно завершить только груз с выбранным исполнителем' });
        }

        const completionState = getLoadCompletionState(load, userId, load.acceptedCarrierUserId);

        if (!completionState.actorSide) {
            return res.status(403).json({ error: 'Нет доступа' });
        }

        if (completionState.isFullyCompleted || load.status === 'completed') {
            return res.json({
                ok: true,
                status: 'completed',
                completion: completionState
            });
        }

       if (Number(load.userId) !== Number(userId)) {
            const offer = await getOne(
                `SELECT * FROM offers WHERE "loadId" = $1 AND "carrierUserId" = $2 AND status = 'accepted'`,
                [loadId, userId]
            );
            if (!offer) return res.status(403).json({ error: 'Нет доступа' });
        }

        if (completionState.actorSide === 'client') {
            await query(
                `UPDATE loads
                 SET "clientCompleted" = true,
                     "clientCompletedAt" = COALESCE("clientCompletedAt", CURRENT_TIMESTAMP),
                     status = CASE WHEN "carrierCompleted" = true THEN 'completed' ELSE status END
                 WHERE id = $1`,
                [loadId]
            );
        } else {
            await query(
                `UPDATE loads
                 SET "carrierCompleted" = true,
                     "carrierCompletedAt" = COALESCE("carrierCompletedAt", CURRENT_TIMESTAMP),
                     status = CASE WHEN "clientCompleted" = true THEN 'completed' ELSE status END
                 WHERE id = $1`,
                [loadId]
            );
        }

        const updatedLoad = await getOne(
            `SELECT loads.*, offers."carrierUserId" AS "acceptedCarrierUserId"
             FROM loads
             LEFT JOIN offers ON offers."loadId" = loads.id AND offers.status = 'accepted'
             WHERE loads.id = $1`,
            [loadId]
        );

        const updatedCompletion = getLoadCompletionState(updatedLoad, userId, updatedLoad?.acceptedCarrierUserId);
        const escrowRelease = updatedCompletion.isFullyCompleted
            ? await releaseEscrowForLoad(pool, loadId)
            : null;

        const completionRecipientIds = (updatedCompletion.isFullyCompleted
            ? [updatedLoad?.userId, updatedLoad?.acceptedCarrierUserId]
            : [completionState.actorSide === 'client' ? updatedLoad?.acceptedCarrierUserId : updatedLoad?.userId])
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id !== Number(userId));

        await sendExpoPushNotifications(completionRecipientIds, {
            title: updatedCompletion.isFullyCompleted
                ? '\u0413\u0440\u0443\u0437 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d'
                : '\u041d\u0443\u0436\u043d\u043e \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435',
            body: makeLoadStatusPushBody(
                updatedLoad,
                updatedCompletion.isFullyCompleted
                    ? '\u0413\u0440\u0443\u0437 \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d'
                    : completionState.actorSide === 'client'
                        ? '\u0413\u0440\u0443\u0437\u043e\u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043b \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0435'
                        : '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043b \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0435'
            ),
            data: {
                type: updatedCompletion.isFullyCompleted ? 'load_completed' : 'load_completion_waiting',
                loadId: String(loadId)
            }
        });

        res.json({
            ok: true,
            status: updatedCompletion.isFullyCompleted ? 'completed' : 'awaiting_other_party',
            completion: updatedCompletion,
            escrow: escrowRelease,
            message: updatedCompletion.isFullyCompleted
                ? 'Груз полностью завершён'
                : updatedCompletion.actorSide === 'client'
                    ? 'Ваше подтверждение сохранено. Ждём подтверждение от перевозчика'
                    : 'Ваше подтверждение сохранено. Ждём подтверждение от грузовладельца'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/update-profile', checkAuth, async (req, res) => {
    res.json({ ok: true });
});

// Получение списка чатов
app.get('/api/chats', checkAuth, async (req, res) => {
    const userId = req.session.userId;

    try {
        const rows = await getMany(`
            SELECT
                chats.id,
                chats."loadId",
                loads.from_location,
                loads.to_location,
                client.name AS client_name,
                carrier.name AS carrier_name,
                chats."clientId",
                chats."carrierId",
                (
                    SELECT text FROM messages
                    WHERE messages."chatId" = chats.id
                    ORDER BY messages."createdAt" DESC LIMIT 1
                ) AS last_message,
                (
                    SELECT messages."createdAt" FROM messages
                    WHERE messages."chatId" = chats.id
                    ORDER BY messages."createdAt" DESC LIMIT 1
                ) AS last_message_time
            FROM chats
            JOIN loads ON loads.id = chats."loadId"
            JOIN users client ON client.id = chats."clientId"
            JOIN users carrier ON carrier.id = chats."carrierId"
            WHERE chats."clientId" = $1 OR chats."carrierId" = $1
            ORDER BY last_message_time DESC NULLS LAST, chats."createdAt" DESC
        `, [userId]);

        const privateChats = rows.map((chat) => ({
            ...chat,
            type: 'private',
            name: Number(chat.clientId) === Number(userId)
                ? (chat.carrier_name || '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a')
                : (chat.client_name || '\u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a')
        }));

        const includeGlobal = req.query.includeGlobal === '1' || req.query.scope === 'all';
        if (includeGlobal) {
            return res.json([
                { id: 'global', type: 'global', name: '\u0413\u043b\u043e\u0431\u0430\u043b\u044c\u043d\u044b\u0439 \u0447\u0430\u0442', last_message: '\u041e\u0431\u0449\u0438\u0439 \u0447\u0430\u0442 RouteHub' },
                ...privateChats
            ]);
        }

        res.json(privateChats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/chats/global/messages', checkAuth, async (req, res) => {
    try {
        const messages = await getMany(`
            SELECT global_messages.*, users.name AS sender_name
            FROM global_messages
            LEFT JOIN users ON users.id = global_messages."senderId"
            ORDER BY global_messages."createdAt" ASC
            LIMIT 300
        `);
        res.json({ messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/chats/global/messages', checkAuth, async (req, res) => {
    const userId = req.session.userId;
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Введите сообщение' });

    try {
        const result = await query(
            'INSERT INTO global_messages ("senderId", text) VALUES ($1, $2) RETURNING *',
            [userId, text.trim()]
        );
        const sender = await getOne('SELECT name FROM users WHERE id = $1', [userId]);
        const message = { ...result.rows[0], sender_name: sender?.name || '' };
        io.to('chat_global').emit('new_message', { room: 'global', message });
        res.json(message);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/chats/:id/messages', checkAuth, async (req, res) => {
    const userId = req.session.userId;
    const chatId = req.params.id;

    try {
        const chat = await getOne(
            'SELECT * FROM chats WHERE id = $1 AND ("clientId" = $2 OR "carrierId" = $2)',
            [chatId, userId]
        );
        if (!chat) return res.status(403).json({ error: 'Нет доступа' });

        const messages = await getMany(`
            SELECT messages.*, users.name AS sender_name
            FROM messages
            JOIN users ON users.id = messages."senderId"
            WHERE messages."chatId" = $1
            ORDER BY messages."createdAt" ASC
        `, [chatId]);

        res.json({ chat, messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/chats/:id/messages', checkAuth, async (req, res) => {
    const userId = req.session.userId;
    const chatId = req.params.id;
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Введите сообщение' });

    try {
        const chat = await getOne(
            'SELECT * FROM chats WHERE id = $1 AND ("clientId" = $2 OR "carrierId" = $2)',
            [chatId, userId]
        );
        if (!chat) return res.status(403).json({ error: 'Нет доступа' });

        const result = await query(
            'INSERT INTO messages ("chatId", "senderId", text) VALUES ($1, $2, $3) RETURNING *',
            [chatId, userId, text.trim()]
        );
        const sender = await getOne('SELECT name FROM users WHERE id = $1', [userId]);
        const message = { ...result.rows[0], sender_name: sender?.name || '' };
        io.to(`chat_${chatId}`).emit('new_message', { room: 'private', chatId: String(chatId), message });

        const recipientIds = [chat.clientId, chat.carrierId]
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id !== Number(userId));

        await sendExpoPushNotifications(recipientIds, {
            title: sender?.name || 'RouteHub',
            body: text.trim(),
            data: { type: 'chat_message', chatId: String(chatId) }
        });

        res.json(message);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/stats', async (req, res) => {
    try {
        const loadStats = await getOne(`
            SELECT
                COUNT(*)::int AS "totalLoads",
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'open')::int AS "openLoads",
                COUNT(*) FILTER (WHERE status = 'assigned')::int AS "assignedLoads",
                COUNT(*) FILTER (WHERE status = 'completed')::int AS "completedLoads",
                COUNT(*) FILTER (WHERE status = 'cancelled')::int AS "cancelledLoads",
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') IN ('open', 'assigned'))::int AS "activeLoads",
                COALESCE(SUM(weight), 0)::float AS "totalWeight",
                COALESCE(AVG(NULLIF(price, 0)), 0)::float AS "averagePrice"
            FROM loads
        `);

        const userStats = await getOne(`
            SELECT
                COUNT(*)::int AS "totalUsers",
                COUNT(*) FILTER (WHERE COALESCE(role, 'client') = 'carrier')::int AS "carriers",
                COUNT(*) FILTER (WHERE COALESCE(role, 'client') <> 'carrier')::int AS "owners",
                COUNT(*) FILTER (WHERE ecp_verified = true)::int AS "verifiedUsers"
            FROM users
        `);

        const offerStats = await getOne(`
            SELECT
                COUNT(*)::int AS "totalOffers",
                COUNT(*) FILTER (WHERE status = 'pending')::int AS "pendingOffers",
                COUNT(*) FILTER (WHERE status = 'accepted')::int AS "acceptedOffers",
                COUNT(*) FILTER (WHERE status = 'rejected')::int AS "rejectedOffers",
                COALESCE(SUM(price) FILTER (WHERE status = 'accepted'), 0)::float AS "acceptedAmountTotal",
                COALESCE(SUM(price) FILTER (
                    WHERE status = 'accepted'
                      AND "createdAt" >= date_trunc('month', CURRENT_DATE)
                ), 0)::float AS "acceptedAmountMonth"
            FROM offers
        `);

        const financeStats = await getOne(`
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE status = 'held'), 0)::float AS "heldAmount",
                COALESCE(SUM(amount) FILTER (WHERE status = 'released'), 0)::float AS "releasedAmount",
                COALESCE(SUM(amount) FILTER (
                    WHERE status = 'released'
                      AND "releasedAt" >= date_trunc('month', CURRENT_DATE)
                ), 0)::float AS "releasedAmountMonth",
                COALESCE(SUM("commissionAmount") FILTER (WHERE status = 'released'), 0)::float AS "commissionAmount",
                COALESCE(SUM("commissionAmount") FILTER (
                    WHERE status = 'released'
                      AND "releasedAt" >= date_trunc('month', CURRENT_DATE)
                ), 0)::float AS "commissionAmountMonth"
            FROM escrows
        `);

        const topRoutes = await getMany(`
            SELECT
                CONCAT(
                    COALESCE(NULLIF(TRIM(from_location), ''), 'Не указано'),
                    ' — ',
                    COALESCE(NULLIF(TRIM(to_location), ''), 'Не указано')
                ) AS route,
                COUNT(*)::int AS count,
                COALESCE(SUM(price), 0)::float AS amount
            FROM loads
            GROUP BY 1
            ORDER BY count DESC, amount DESC
            LIMIT 5
        `);

        const cities = await getMany(`
            WITH city_rows AS (
                SELECT NULLIF(TRIM(from_location), '') AS city FROM loads
                UNION ALL
                SELECT NULLIF(TRIM(to_location), '') AS city FROM loads
            )
            SELECT city, COUNT(*)::int AS count
            FROM city_rows
            WHERE city IS NOT NULL
            GROUP BY city
            ORDER BY count DESC, city ASC
            LIMIT 5
        `);

        const totalLoads = Number(loadStats?.totalLoads || 0);
        const completedLoads = Number(loadStats?.completedLoads || 0);
        const completionRate = totalLoads > 0 ? Math.round((completedLoads / totalLoads) * 100) : 0;

        res.json({
            totalLoads,
            totalUsers: Number(userStats?.totalUsers || 0),
            activeLoads: Number(loadStats?.activeLoads || 0),
            carriers: Number(userStats?.carriers || 0),
            cities,
            topRoutes,
            loads: {
                total: totalLoads,
                open: Number(loadStats?.openLoads || 0),
                assigned: Number(loadStats?.assignedLoads || 0),
                completed: completedLoads,
                cancelled: Number(loadStats?.cancelledLoads || 0),
                active: Number(loadStats?.activeLoads || 0),
                totalWeight: Number(loadStats?.totalWeight || 0),
                averagePrice: Number(loadStats?.averagePrice || 0),
                completionRate
            },
            users: {
                total: Number(userStats?.totalUsers || 0),
                carriers: Number(userStats?.carriers || 0),
                owners: Number(userStats?.owners || 0),
                verified: Number(userStats?.verifiedUsers || 0)
            },
            offers: {
                total: Number(offerStats?.totalOffers || 0),
                pending: Number(offerStats?.pendingOffers || 0),
                accepted: Number(offerStats?.acceptedOffers || 0),
                rejected: Number(offerStats?.rejectedOffers || 0),
                acceptedAmountTotal: Number(offerStats?.acceptedAmountTotal || 0),
                acceptedAmountMonth: Number(offerStats?.acceptedAmountMonth || 0)
            },
            finance: {
                heldAmount: Number(financeStats?.heldAmount || 0),
                releasedAmount: Number(financeStats?.releasedAmount || 0),
                releasedAmountMonth: Number(financeStats?.releasedAmountMonth || 0),
                commissionAmount: Number(financeStats?.commissionAmount || 0),
                commissionAmountMonth: Number(financeStats?.commissionAmountMonth || 0)
            },
            updatedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error('/api/stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/my-loads', checkAuth, async (req, res) => {
    const userId = req.session.userId;

    try {
        const rows = await getMany(
            `SELECT
                loads.*,
                offers."carrierUserId" AS "acceptedCarrierUserId",
                offers."carrierName" AS "acceptedCarrierName",
                offers."carrierPhone" AS "acceptedCarrierPhone",
                EXISTS (
                    SELECT 1 FROM reviews
                    WHERE reviews."reviewerId" = $1
                      AND reviews."loadId" = loads.id
                ) AS "reviewGiven",
                escrows.status AS "escrowStatus",
                escrows.amount AS "escrowAmount",
                escrows."carrierAmount" AS "escrowCarrierAmount",
                escrows."commissionAmount" AS "escrowCommissionAmount"
             FROM loads
             LEFT JOIN offers
                ON offers."loadId" = loads.id
               AND offers.status = 'accepted'
             LEFT JOIN escrows
                ON escrows."loadId" = loads.id
               AND escrows.status IN ('held', 'released')
             WHERE loads."userId" = $1
             ORDER BY loads.id DESC`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/my-offers', checkAuth, async (req, res) => {
    const userId = req.session.userId;

    const sql = `
        SELECT
            offers.*,
            loads.from_location,
            loads.to_location,
            loads.type AS load_type,
            loads.weight,
            loads.status AS load_status,
            loads."clientCompleted" AS "clientCompleted",
            loads."carrierCompleted" AS "carrierCompleted",
            loads."userId" AS "ownerId",
            users.name AS "ownerName",
            users.company AS "ownerCompany",
            EXISTS (
                SELECT 1 FROM reviews
                WHERE reviews."reviewerId" = $1
                  AND reviews."loadId" = loads.id
            ) AS "reviewGiven"
        FROM offers
        JOIN loads ON loads.id = offers."loadId"
        JOIN users ON users.id = loads."userId"
        WHERE offers."carrierUserId" = $1
        ORDER BY offers.id DESC
    `;

    try {
        const rows = await getMany(sql, [userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/loads/:id', checkAuth, async (req, res) => {
    const loadId = req.params.id;
    const userId = req.session.userId;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const ownerCheck = await client.query('SELECT id FROM loads WHERE id = $1 AND "userId" = $2 FOR UPDATE', [loadId, userId]);
        if (ownerCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Груз не найден или не принадлежит вам' });
        }

        await refundEscrowForLoad(client, loadId, 'Оплата возвращена после удаления груза');
        await client.query('DELETE FROM loads WHERE id = $1 AND "userId" = $2', [loadId, userId]);

        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.statusCode || 500).json({ error: err.message });
    } finally {
        client.release();
    }
});
app.get('/api/favorites', checkAuth, async (req, res) => {
    const userId = req.session.userId;
    const sql = `
        SELECT l.* FROM loads l
        INNER JOIN favorites f ON l.id = f."loadId"
        WHERE f."userId" = $1
    `;

    try {
        const rows = await getMany(sql, [userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/favorites/:loadId', checkAuth, async (req, res) => {
    const userId = req.session.userId;
    const loadId = req.params.loadId;

    try {
        await query('DELETE FROM favorites WHERE "userId" = $1 AND "loadId" = $2', [userId, loadId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/favorites', checkAuth, async (req, res) => {
    const userId = req.session.userId;
    const { loadId } = req.body;

    if (!loadId) return res.status(400).json({ error: 'ID груза не указан' });

    try {
        await query('INSERT INTO favorites ("userId", "loadId") VALUES ($1, $2)', [userId, loadId]);
        res.json({ success: true });
    } catch (err) {
        if (isUniqueViolation(err)) {
            return res.status(400).json({ error: 'Уже в избранном' });
        }
        res.status(500).json({ error: err.message });
    }
});

const PORT = Number(process.env.PORT || 3000);

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*' }
});

// Socket.io — realtime чат
io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Присоединиться к комнате чата
    socket.on('join_chat', (chatId) => {
        socket.join(`chat_${chatId}`);
        console.log(`Socket ${socket.id} joined chat_${chatId}`);
    });

    // Покинуть комнату
    socket.on('leave_chat', (chatId) => {
        socket.leave(`chat_${chatId}`);
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);
    });
});

// API — получить список чатов юзера
app.get('/api/mobile/chats', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;

    try {
        const rows = await getMany(`
            SELECT
                chats.id,
                chats."loadId",
                loads.from_location,
                loads.to_location,
                loads.type AS load_type,
                client.name AS client_name,
                carrier.name AS carrier_name,
                chats."clientId",
                chats."carrierId",
                (
                    SELECT text FROM messages
                    WHERE messages."chatId" = chats.id
                    ORDER BY messages."createdAt" DESC LIMIT 1
                ) AS last_message,
                (
                    SELECT messages."createdAt" FROM messages
                    WHERE messages."chatId" = chats.id
                    ORDER BY messages."createdAt" DESC LIMIT 1
                ) AS last_message_time
            FROM chats
            JOIN loads ON loads.id = chats."loadId"
            JOIN users client ON client.id = chats."clientId"
            JOIN users carrier ON carrier.id = chats."carrierId"
            WHERE chats."clientId" = $1 OR chats."carrierId" = $1
            ORDER BY last_message_time DESC NULLS LAST
        `, [userId]);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API — получить сообщения чата
app.get('/api/mobile/chats/:chatId/messages', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const chatId = req.params.chatId;

    try {
        // Проверяем доступ
        const chat = await getOne(
            'SELECT * FROM chats WHERE id = $1 AND ("clientId" = $2 OR "carrierId" = $2)',
            [chatId, userId]
        );
        if (!chat) return res.status(403).json({ error: 'Нет доступа' });

        const messages = await getMany(`
            SELECT messages.*, users.name AS sender_name
            FROM messages
            JOIN users ON users.id = messages."senderId"
            WHERE messages."chatId" = $1
            ORDER BY messages."createdAt" ASC
        `, [chatId]);

        res.json({ chat, messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API — отправить сообщение
app.post('/api/mobile/chats/:chatId/messages', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const chatId = req.params.chatId;
    const { text } = req.body;

    if (!text?.trim()) return res.status(400).json({ error: 'Введите сообщение' });

    try {
        const chat = await getOne(
            'SELECT * FROM chats WHERE id = $1 AND ("clientId" = $2 OR "carrierId" = $2)',
            [chatId, userId]
        );
        if (!chat) return res.status(403).json({ error: 'Нет доступа' });

        const result = await query(
            'INSERT INTO messages ("chatId", "senderId", text) VALUES ($1, $2, $3) RETURNING *',
            [chatId, userId, text.trim()]
        );

        const message = result.rows[0];
        const sender = await getOne('SELECT name FROM users WHERE id = $1', [userId]);

        const fullMessage = { ...message, sender_name: sender?.name || '' };

        // Отправить всем в комнате
        io.to(`chat_${chatId}`).emit('new_message', fullMessage);

        const recipientIds = [chat.clientId, chat.carrierId]
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id !== Number(userId));

        await sendExpoPushNotifications(recipientIds, {
            title: sender?.name || 'RouteHub',
            body: text.trim(),
            data: {
                type: 'chat_message',
                chatId: String(chatId)
            }
        });

        res.json(fullMessage);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API — создать чат (вызывается при отправке ставки)
app.post('/api/mobile/chats', checkMobileAuth, async (req, res) => {
    const userId = req.mobileUser.userId;
    const { loadId, offerId } = req.body;

    try {
        const load = await getOne('SELECT * FROM loads WHERE id = $1', [loadId]);
        if (!load) return res.status(404).json({ error: 'Груз не найден' });

        let clientId = load.userId;
        let carrierId = userId;

        if (offerId) {
            const offer = await getOne(
                `SELECT offers.*, loads."userId" AS "ownerId"
                 FROM offers
                 JOIN loads ON loads.id = offers."loadId"
                 WHERE offers.id = $1 AND offers."loadId" = $2`,
                [offerId, loadId]
            );

            if (!offer) return res.status(404).json({ error: 'Ставка не найдена' });

            const isOwner = Number(offer.ownerId) === Number(userId);
            const isCarrier = Number(offer.carrierUserId) === Number(userId);
            if (!isOwner && !isCarrier) return res.status(403).json({ error: 'Нет доступа' });

            clientId = offer.ownerId;
            carrierId = offer.carrierUserId;
        } else if (Number(load.userId) === Number(userId)) {
            return res.status(400).json({ error: 'Для чата с перевозчиком нужна ставка' });
        }

        let chat = await getOne(
            'SELECT * FROM chats WHERE "loadId" = $1 AND "carrierId" = $2',
            [loadId, carrierId]
        );

        if (!chat) {
            const result = await query(
                'INSERT INTO chats ("loadId", "clientId", "carrierId") VALUES ($1, $2, $3) RETURNING *',
                [loadId, clientId, carrierId]
            );
            chat = result.rows[0];
        }

        res.json(chat);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// =========================
// AI HELPERS
// =========================

function getAiUserFromRequest(req) {
    // web via session
    if (req.session && req.session.userId) {
        return {
            userId: req.session.userId,
            role: 'web'
        };
    }

    // mobile app via JWT middleware
    if (req.mobileUser && req.mobileUser.userId) {
        return {
            userId: req.mobileUser.userId,
            role: req.mobileUser.role || 'client'
        };
    }

    return null;
}

const AI_KNOWN_CITIES = [
    'Алматы', 'Астана', 'Шымкент', 'Кызылорда', 'Караганда', 'Актобе', 'Атырау', 'Актау',
    'Костанай', 'Павлодар', 'Тараз', 'Уральск', 'Семей', 'Усть-Каменогорск', 'Туркестан'
];

const AI_KNOWN_LOAD_TYPES = [
    'Тент', 'Рефрижератор', 'Фура', 'Контейнер', 'Изотерм', 'Цельнометалл', 'Бортовой'
];

function isGroqModelName(model = '') {
    return /^(llama|mixtral|gemma|qwen|deepseek)\b/i.test(String(model || '').trim());
}

function getAiProviderConfig() {
    const explicitKey = String(process.env.AI_API_KEY || '').trim();
    const explicitBaseURL = String(process.env.AI_BASE_URL || '').trim();
    const explicitProvider = String(process.env.AI_PROVIDER || '').trim().toLowerCase();

    if (explicitKey) {
        return {
            provider: explicitProvider || 'custom',
            apiKey: explicitKey,
            baseURL: explicitBaseURL || undefined,
            model: process.env.AI_MODEL || (explicitBaseURL.includes('groq.com') ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini')
        };
    }

    if (process.env.OPENAI_API_KEY) {
        const configuredModel = String(process.env.OPENAI_MODEL || process.env.AI_MODEL || '').trim();
        return {
            provider: 'openai',
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: process.env.OPENAI_BASE_URL || undefined,
            model: configuredModel && !isGroqModelName(configuredModel) ? configuredModel : 'gpt-4o-mini'
        };
    }

    if (process.env.GROQ_API_KEY) {
        return {
            provider: 'groq',
            apiKey: process.env.GROQ_API_KEY,
            baseURL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
            model: process.env.GROQ_MODEL || process.env.AI_MODEL || 'llama-3.3-70b-versatile'
        };
    }

    return null;
}

function createAiClient(providerConfig) {
    const options = { apiKey: providerConfig.apiKey };
    if (providerConfig.baseURL) options.baseURL = providerConfig.baseURL;
    return new OpenAI(options);
}

function normalizeAiClientContext(context = {}) {
    if (!context || typeof context !== 'object') return {};
    return {
        screen: String(context.screen || '').slice(0, 120),
        source: String(context.source || '').slice(0, 80)
    };
}

function normalizeAiText(value) {
    return String(value || '').trim().toLowerCase();
}

function isMyLoadsRequest(message = '') {
    const text = normalizeAiText(message);
    return /мои\s+груз|мой\s+груз|что\s+я\s+размест|мои\s+объявлен/.test(text);
}

function isAccountSummaryRequest(message = '') {
    const text = normalizeAiText(message);
    return /мой\s+аккаунт|профил|баланс|кошел|настройк|уведомлен|статус\s+аккаунт/.test(text);
}

function isAiSearchLoadsRequest(message = '') {
    const text = normalizeAiText(message);
    if (!text) return false;
    if (isMyLoadsRequest(text)) return false;
    return /найд|покаж|поиск|груз|рейс|маршрут|перевоз|ставк/.test(text);
}

function parseAiLoadSearchArgs(message = '') {
    const text = normalizeAiText(message);
    const matchedCities = AI_KNOWN_CITIES.filter((city) => text.includes(city.toLowerCase()));
    const matchedType = AI_KNOWN_LOAD_TYPES.find((type) => text.includes(type.toLowerCase()));
    const args = { limit: 8 };

    if (matchedCities[0]) args.from = matchedCities[0];
    if (matchedCities[1]) args.to = matchedCities[1];
    if (matchedType) args.loadType = matchedType;

    const maxWeightMatch = text.match(/(?:до|<=|меньше|не\s+больше)\s*(\d+(?:[.,]\d+)?)\s*(?:т|тонн)/i);
    if (maxWeightMatch) args.maxWeight = Number(maxWeightMatch[1].replace(',', '.'));

    const minPriceMatch = text.match(/(?:от|>=|больше)\s*(\d[\d\s.,]*)\s*(?:тг|₸|kzt|тенге)/i);
    if (minPriceMatch) args.minPrice = Number(minPriceMatch[1].replace(/\s/g, '').replace(',', '.'));

    const maxPriceMatch = text.match(/(?:до|<=|меньше|не\s+больше)\s*(\d[\d\s.,]*)\s*(?:тг|₸|kzt|тенге)/i);
    if (maxPriceMatch) args.maxPrice = Number(maxPriceMatch[1].replace(/\s/g, '').replace(',', '.'));

    return args;
}

async function aiSearchLoads(args = {}) {
    const from = String(args.from || '').trim();
    const to = String(args.to || '').trim();
    const loadType = String(args.loadType || args.type || '').trim();
    const readyDate = String(args.readyDate || args.date || '').trim();
    const minPrice = Number(args.minPrice || 0);
    const maxPrice = Number(args.maxPrice || 0);
    const maxWeight = Number(args.maxWeight || 0);
    const limit = Math.min(Number(args.limit || 6), 12);

    let sql = `
        SELECT
            id,
            from_location,
            to_location,
            weight,
            type,
            price,
            date,
            status
        FROM loads
        WHERE COALESCE(status, 'open') <> 'completed'
    `;

    const params = [];
    let idx = 1;

    if (from) {
        sql += ` AND from_location ILIKE $${idx++}`;
        params.push(`%${from}%`);
    }

    if (to) {
        sql += ` AND to_location ILIKE $${idx++}`;
        params.push(`%${to}%`);
    }

    if (loadType) {
        sql += ` AND type ILIKE $${idx++}`;
        params.push(`%${loadType}%`);
    }

    if (readyDate) {
        sql += ` AND date ILIKE $${idx++}`;
        params.push(`%${readyDate}%`);
    }

    if (minPrice > 0) {
        sql += ` AND price >= $${idx++}`;
        params.push(minPrice);
    }

    if (maxPrice > 0) {
        sql += ` AND price <= $${idx++}`;
        params.push(maxPrice);
    }

    if (maxWeight > 0) {
        sql += ` AND weight <= $${idx++}`;
        params.push(maxWeight);
    }

    sql += ` ORDER BY id DESC LIMIT $${idx++}`;
    params.push(limit);

    const rows = await getMany(sql, params);

    return rows.map((row) => ({
        ...row,
        url: `/page2/card.html?id=${row.id}`
    }));
}

async function aiGetMyLoads(userId) {
    const rows = await getMany(
        `
        SELECT
            id,
            from_location,
            to_location,
            weight,
            type,
            price,
            date,
            status
        FROM loads
        WHERE "userId" = $1
        ORDER BY id DESC
        LIMIT 20
        `,
        [userId]
    );

    return rows;
}

async function aiGetRecommendedLoads(userId) {
    const myLoads = await getMany(
        `
        SELECT
            id,
            from_location,
            to_location,
            weight,
            type,
            price,
            date,
            status
        FROM loads
        WHERE "userId" = $1
          AND status IN ('open', 'assigned')
        ORDER BY id DESC
        LIMIT 5
        `,
        [userId]
    );

    if (!myLoads.length) {
        return [];
    }

    const recommendationsMap = new Map();

    for (const load of myLoads) {
        const from = String(load.from_location || '').trim();
        const to = String(load.to_location || '').trim();

        if (!from && !to) continue;

        const params = [userId];
        let idx = 2;
        let sql = `
            SELECT
                id,
                from_location,
                to_location,
                weight,
                type,
                price,
                date,
                status
            FROM loads
            WHERE "userId" <> $1
              AND status = 'open'
        `;

        const routeChecks = [];

        if (to) {
            routeChecks.push(`from_location ILIKE $${idx++}`);
            params.push(`%${to}%`);

            routeChecks.push(`to_location ILIKE $${idx++}`);
            params.push(`%${to}%`);
        }

        if (from) {
            routeChecks.push(`from_location ILIKE $${idx++}`);
            params.push(`%${from}%`);

            routeChecks.push(`to_location ILIKE $${idx++}`);
            params.push(`%${from}%`);
        }

        if (!routeChecks.length) continue;

        sql += ` AND (${routeChecks.join(' OR ')})`;
        sql += ` ORDER BY id DESC LIMIT 8`;

        const rows = await getMany(sql, params);

        rows.forEach((item) => {
            const fromMatch = from && (
                String(item.from_location || '').toLowerCase().includes(from.toLowerCase()) ||
                String(item.to_location || '').toLowerCase().includes(from.toLowerCase())
            );
            const toMatch = to && (
                String(item.from_location || '').toLowerCase().includes(to.toLowerCase()) ||
                String(item.to_location || '').toLowerCase().includes(to.toLowerCase())
            );

            let recommendationReason = 'Подходит по вашему маршруту';

            if (toMatch && fromMatch) {
                recommendationReason = `Связан с вашим маршрутом ${from || '—'} -> ${to || '—'}`;
            } else if (toMatch) {
                recommendationReason = `Рядом с точкой выгрузки: ${to}`;
            } else if (fromMatch) {
                recommendationReason = `Рядом с точкой загрузки: ${from}`;
            }

            if (!recommendationsMap.has(item.id)) {
                recommendationsMap.set(item.id, {
                    ...item,
                    recommendation_reason: recommendationReason,
                    url: `/page2/card.html?id=${item.id}`
                });
            }
        });
    }

    return Array.from(recommendationsMap.values()).slice(0, 8);
}

async function aiGetMyOffers(userId) {
    return getMany(
        `
        SELECT
            offers.id,
            offers.price,
            offers.currency,
            offers.status,
            offers."pickupDate",
            offers."truckType",
            offers.comment,
            offers."createdAt",
            loads.id AS "loadId",
            loads.from_location,
            loads.to_location,
            loads.type,
            loads.date
        FROM offers
        JOIN loads ON loads.id = offers."loadId"
        WHERE offers."carrierUserId" = $1
        ORDER BY offers."createdAt" DESC
        LIMIT 15
        `,
        [userId]
    );
}

async function aiGetAccountSummary(userId) {
    const [user, wallet, loadStats, offerStats, favorites, chats] = await Promise.all([
        getOne(
            `SELECT id, name, email, phone, company, role, person_type, user_code,
                    push_notifications, email_notifications, dark_theme
             FROM users WHERE id = $1`,
            [userId]
        ),
        getOne(
            `SELECT balance::float AS balance, "heldBalance"::float AS "heldBalance", currency
             FROM wallets WHERE "userId" = $1`,
            [userId]
        ).catch(() => null),
        getOne(
            `SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'open')::int AS open,
                    COUNT(*) FILTER (WHERE COALESCE(status, '') = 'assigned')::int AS assigned,
                    COUNT(*) FILTER (WHERE COALESCE(status, '') = 'completed')::int AS completed
             FROM loads WHERE "userId" = $1`,
            [userId]
        ),
        getOne(
            `SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                    COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
                    COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
             FROM offers WHERE "carrierUserId" = $1`,
            [userId]
        ),
        getOne('SELECT COUNT(*)::int AS total FROM favorites WHERE "userId" = $1', [userId]),
        getOne('SELECT COUNT(*)::int AS total FROM chats WHERE "clientId" = $1 OR "carrierId" = $1', [userId])
    ]);

    return {
        user,
        wallet: wallet || { balance: 0, heldBalance: 0, currency: 'KZT' },
        loads: loadStats || { total: 0, open: 0, assigned: 0, completed: 0 },
        offers: offerStats || { total: 0, pending: 0, accepted: 0, rejected: 0 },
        favorites: favorites?.total || 0,
        chats: chats?.total || 0
    };
}

function formatAiAccountSummary(summary) {
    const user = summary.user || {};
    const wallet = summary.wallet || {};
    const loads = summary.loads || {};
    const offers = summary.offers || {};

    return [
        'Аккаунт: ' + (user.name || user.company || user.email || 'пользователь RouteHub'),
        'Роль: ' + (user.role === 'carrier' ? 'перевозчик' : 'грузовладелец'),
        'Баланс: ' + Number(wallet.balance || 0).toLocaleString('ru-RU') + ' ' + (wallet.currency || 'KZT') + ', в удержании: ' + Number(wallet.heldBalance || 0).toLocaleString('ru-RU') + ' ' + (wallet.currency || 'KZT'),
        'Грузы: всего ' + (loads.total || 0) + ', открытых ' + (loads.open || 0) + ', в работе ' + (loads.assigned || 0) + ', завершённых ' + (loads.completed || 0),
        'Ставки перевозчика: всего ' + (offers.total || 0) + ', ожидают ' + (offers.pending || 0) + ', приняты ' + (offers.accepted || 0),
        'Избранное: ' + (summary.favorites || 0) + ', чаты: ' + (summary.chats || 0)
    ].join('\\n');
}

function buildAiSystemPrompt({ currentUser = null, clientContext = {} } = {}) {
    const roleText = currentUser?.role === 'carrier'
        ? 'Пользователь сейчас перевозчик.'
        : currentUser?.role === 'client'
            ? 'Пользователь сейчас грузовладелец.'
            : 'Роль пользователя неизвестна.';
    const screenText = clientContext.screen ? 'Текущий экран приложения: ' + clientContext.screen + '.' : '';

    return [
        'Ты AI-помощник RouteHub. Тебя зовут RouteHub AI.',
        '',
        'Отвечай на русском простым человеческим языком. Можно отвечать на любые обычные вопросы пользователя, но если вопрос связан с RouteHub, логистикой, грузами, ставками, кошельком, профилем или картой, давай практичный ответ именно по приложению.',
        '',
        roleText,
        screenText,
        '',
        'Что умеет RouteHub:',
        '- Грузовладелец создаёт грузы во вкладке "Создать", выбирает маршрут, дату, тип кузова, вес, размеры и ставку.',
        '- Перевозчик ищет грузы на главной, открывает карточку груза, отправляет ставку и пишет грузовладельцу.',
        '- Вкладка "Чат" содержит диалоги и AI-помощника.',
        '- Вкладка "Активные" у перевозчика показывает активные заказы.',
        '- В профиле есть настройки, безопасность, баланс, документы и отзывы.',
        '- Кошелёк используется для пополнений, выводов и удержаний по заказам.',
        '',
        'Правила:',
        '- Если пользователь ищет грузы, используй searchLoads.',
        '- Если просит мои грузы, используй getMyLoads.',
        '- Если просит попутные или рекомендованные грузы, используй getRecommendedLoads.',
        '- Если спрашивает про свой аккаунт, баланс, статистику, настройки или что у него сейчас в системе, используй getAccountSummary.',
        '- Если перевозчик спрашивает про свои ставки, используй getMyOffers.',
        '- Если данных нет, честно скажи, что в базе этого нет, и предложи следующий шаг.',
        '- Не выдумывай цены, телефоны, балансы, грузы и статусы. Для данных пользователя опирайся только на tools.',
        '- Если вопрос не про RouteHub, отвечай как обычный помощник, кратко и по делу.'
    ].filter(Boolean).join('\n');
}

function getAiTools(currentUser) {
    const tools = [
        {
            type: 'function',
            function: {
                name: 'searchLoads',
                description: 'Поиск доступных грузов в базе RouteHub по маршруту, типу, дате, цене или весу',
                parameters: {
                    type: 'object',
                    properties: {
                        from: { type: 'string', description: 'Город или точка отправления' },
                        to: { type: 'string', description: 'Город или точка назначения' },
                        loadType: { type: 'string', description: 'Тип груза или кузова' },
                        readyDate: { type: 'string', description: 'Дата готовности или перевозки' },
                        minPrice: { type: 'number', description: 'Минимальная цена' },
                        maxPrice: { type: 'number', description: 'Максимальная цена' },
                        maxWeight: { type: 'number', description: 'Максимальный вес груза в тоннах' },
                        limit: { type: 'number', description: 'Сколько результатов вернуть' }
                    },
                    additionalProperties: false
                }
            }
        }
    ];

    if (currentUser && currentUser.userId) {
        tools.push(
            {
                type: 'function',
                function: {
                    name: 'getMyLoads',
                    description: 'Показать грузы текущего авторизованного пользователя',
                    parameters: { type: 'object', properties: {}, additionalProperties: false }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'getRecommendedLoads',
                    description: 'Показать попутные или рекомендованные грузы по маршрутам пользователя',
                    parameters: { type: 'object', properties: {}, additionalProperties: false }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'getAccountSummary',
                    description: 'Краткая сводка аккаунта: профиль, баланс, грузы, ставки, избранное и чаты',
                    parameters: { type: 'object', properties: {}, additionalProperties: false }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'getMyOffers',
                    description: 'Последние ставки текущего пользователя как перевозчика',
                    parameters: { type: 'object', properties: {}, additionalProperties: false }
                }
            }
        );
    }

    return tools;
}

function getStaticAiAnswer(message = '') {
    const text = normalizeAiText(message);

    if (/как\s+(создать|добавить|разместить)\s+груз|создать\s+груз|добавить\s+груз|разместить\s+груз/.test(text)) {
        return 'Чтобы создать груз в RouteHub:\n\n1. Войди как грузовладелец.\n2. Открой вкладку "Создать".\n3. Укажи откуда и куда везти.\n4. Выбери дату, тип кузова, вес, размеры и способ погрузки.\n5. Укажи ставку минимум 1 000 ₸.\n6. Нажми "Опубликовать груз".\n\nПосле этого перевозчики увидят груз и смогут отправлять ставки.';
    }

    if (/что\s+такое\s+routehub|как\s+работает\s+routehub|что\s+за\s+routehub/.test(text)) {
        return 'RouteHub — это площадка для грузоперевозок: грузовладельцы размещают грузы, перевозчики находят подходящие заказы, отправляют ставки и общаются в чате.';
    }

    if (/как\s+отправить\s+ставк|сделать\s+ставк|предложить\s+цен/.test(text)) {
        return 'Чтобы отправить ставку, открой карточку груза, нажми кнопку отправки ставки, укажи цену, дату подачи, транспорт и комментарий. После отправки грузовладелец увидит предложение.';
    }

    if (/как\s+пополнить|пополнить\s+баланс|кошел/.test(text)) {
        return 'Баланс пополняется через профиль: открой кошелёк или пополнение баланса, переведи деньги по реквизитам и прикрепи квитанцию. Админ проверит платёж и зачислит баланс.';
    }

    return null;
}

function isRecommendedLoadsRequest(message = '') {
    const text = normalizeAiText(message);
    return /попутн|по\s+пути|по\s+дороге|рекоменд|что\s+могу\s+забрать|какие\s+грузы\s+могу\s+взять/.test(text);
}

async function buildAiFallbackResponse(message, currentUser) {
    const staticAnswer = getStaticAiAnswer(message);
    if (staticAnswer) return { text: staticAnswer, loads: [] };

    if (currentUser?.userId && isRecommendedLoadsRequest(message)) {
        const loads = await aiGetRecommendedLoads(currentUser.userId);
        return {
            text: loads.length ? 'Нашёл попутные грузы по твоим маршрутам.' : 'По твоим текущим маршрутам попутные грузы пока не найдены.',
            loads
        };
    }

    if (currentUser?.userId && isMyLoadsRequest(message)) {
        const loads = await aiGetMyLoads(currentUser.userId);
        return {
            text: loads.length ? 'Вот твои последние грузы.' : 'У тебя пока нет опубликованных грузов.',
            loads
        };
    }

    if (currentUser?.userId && isAccountSummaryRequest(message)) {
        const summary = await aiGetAccountSummary(currentUser.userId);
        return { text: formatAiAccountSummary(summary), loads: [] };
    }

    if (isAiSearchLoadsRequest(message)) {
        const loads = await aiSearchLoads(parseAiLoadSearchArgs(message));
        return {
            text: loads.length ? 'Нашёл грузы по твоему запросу.' : 'По этому запросу грузы не найдены. Попробуй указать город, маршрут, тип кузова или цену.',
            loads
        };
    }

    return {
        text: 'Я RouteHub AI. Могу ответить на вопросы по сервису, грузам, ставкам, кошельку, профилю и маршрутам. Спроси, например: "найди грузы из Алматы", "покажи мои грузы", "какой у меня баланс" или "как отправить ставку".',
        loads: []
    };
}

async function runAiTool(toolCall, currentUser) {
    const toolName = toolCall.function?.name || toolCall.name;
    const rawArgs = toolCall.function?.arguments || toolCall.arguments || '{}';
    let args = {};

    try {
        args = JSON.parse(rawArgs || '{}');
    } catch (_) {
        args = {};
    }

    if (toolName === 'searchLoads') {
        return aiSearchLoads(args);
    }

    if (!currentUser || !currentUser.userId) {
        throw new Error('Пользователь не авторизован');
    }

    if (toolName === 'getMyLoads') {
        return aiGetMyLoads(currentUser.userId);
    }

    if (toolName === 'getRecommendedLoads') {
        return aiGetRecommendedLoads(currentUser.userId);
    }

    if (toolName === 'getAccountSummary') {
        return aiGetAccountSummary(currentUser.userId);
    }

    if (toolName === 'getMyOffers') {
        return aiGetMyOffers(currentUser.userId);
    }

    throw new Error('Неизвестный tool: ' + toolName);
}

function normalizeAiHistory(history = []) {
    if (!Array.isArray(history)) return [];

    return history.slice(-10).map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: String(item.content || '')
    })).filter((item) => item.content.trim());
}

function getAiTextFromChatCompletion(completion) {
    return completion?.choices?.[0]?.message?.content || '';
}

async function handleAiChatRequest(req, res, { mobile = false } = {}) {
    const currentUser = getAiUserFromRequest(req);
    const { message, history = [], context = {} } = req.body || {};

    try {
        if (!message || !String(message).trim()) {
            return res.status(400).json({ error: 'Сообщение пустое' });
        }

        const staticAnswer = getStaticAiAnswer(message);
        if (staticAnswer) {
            return res.json({ ok: true, text: staticAnswer, loads: [] });
        }

        if (currentUser && currentUser.userId && isRecommendedLoadsRequest(message)) {
            const recommendedLoads = await aiGetRecommendedLoads(currentUser.userId);
            return res.json({
                ok: true,
                text: recommendedLoads.length
                    ? 'Нашёл попутные грузы по твоему маршруту.'
                    : 'По твоему текущему маршруту попутные грузы пока не найдены.',
                loads: recommendedLoads
            });
        }

        const providerConfig = getAiProviderConfig();
        if (!providerConfig) {
            const fallback = await buildAiFallbackResponse(message, currentUser);
            return res.json({ ok: true, text: fallback.text, loads: fallback.loads, degraded: true });
        }

        const clientContext = normalizeAiClientContext(context);
        const messages = [
            { role: 'system', content: buildAiSystemPrompt({ currentUser, clientContext }) },
            ...normalizeAiHistory(history),
            { role: 'user', content: String(message) }
        ];

        const tools = getAiTools(currentUser);
        const aiClient = createAiClient(providerConfig);

        const firstCompletion = await aiClient.chat.completions.create({
            model: providerConfig.model,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.3
        });

        const firstMessage = firstCompletion?.choices?.[0]?.message || {};
        const toolCalls = firstMessage.tool_calls || [];

        if (!toolCalls.length) {
            return res.json({
                ok: true,
                text: firstMessage.content || 'Пустой ответ от AI',
                loads: []
            });
        }

        let foundLoads = [];
        const toolMessages = [];

        for (const toolCall of toolCalls) {
            const toolResult = await runAiTool(toolCall, currentUser);

            if (Array.isArray(toolResult)) {
                foundLoads = toolResult;
            }

            toolMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(toolResult).slice(0, 18000)
            });
        }

        const finalCompletion = await aiClient.chat.completions.create({
            model: providerConfig.model,
            messages: [
                ...messages,
                firstMessage,
                ...toolMessages
            ],
            temperature: 0.3
        });

        return res.json({
            ok: true,
            text: getAiTextFromChatCompletion(finalCompletion) || (foundLoads.length ? 'Нашёл данные по твоему запросу.' : 'По этому запросу данных не найдено.'),
            loads: foundLoads
        });
    } catch (err) {
        console.error('AI ' + (mobile ? '/api/mobile/ai/chat' : '/api/ai/chat') + ' error:', err);

        try {
            const fallback = await buildAiFallbackResponse(message, currentUser);
            return res.json({
                ok: true,
                text: fallback.text,
                loads: fallback.loads,
                degraded: true,
                ai_error: process.env.NODE_ENV === 'production' ? undefined : err.message
            });
        } catch (_) {
            return res.status(err.statusCode || 500).json({ error: 'Ошибка AI: ' + err.message });
        }
    }
}

// =========================
// AI ROUTES
// =========================

app.post('/api/ai/chat', async (req, res) => {
    return handleAiChatRequest(req, res, { mobile: false });
});

app.post('/api/mobile/ai/chat', checkMobileAuth, async (req, res) => {
    return handleAiChatRequest(req, res, { mobile: true });
});

initDb()
    .then(() => {
        httpServer.listen(PORT, '0.0.0.0', () => console.log(`Server is running on port ${PORT}`));
    })
    .catch((err) => {
        console.error('Ошибка инициализации PostgreSQL:', err);
        process.exit(1);
    });


const ChatTemplates = {
    // 1. Метод для отрисовки списка чатов (когда заходим во вкладку)
    renderList: function (chats) {
        return `
            <div class="chats-list-container" style="padding: 20px;">
                <h2 style="color: white; margin-bottom: 20px; font-size: 1.2rem;">Сообщения</h2>
                ${chats.map(chat => `
                    <div class="chat-item" data-id="${chat.id}" style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 15px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #818cf8; font-weight: bold;">${chat.name}</span>
                            <span style="font-size: 10px; color: #64748b;">${chat.lastMessageTime || ''}</span>
                        </div>
                        <div style="color: #94a3b8; font-size: 13px; margin-top: 5px;">${chat.lastMessage || 'Нажмите, чтобы открыть чат'}</div>
                    </div>
                `).join('')}
            </div>
        `;

    },

    // 3. Метод для отрисовки каждого сообщения
    renderMessage: function (msg) {
        const isMe = msg.isMe;
        return `
            <div style="margin-bottom: 15px; text-align: ${isMe ? 'right' : 'left'}">
                <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">
                    ${msg.sender} — ${msg.time}
                </div>
                <div style="display: inline-block; padding: 10px 15px; border-radius: 12px;
                            background: ${isMe ? '#6366f1' : 'rgba(255,255,255,0.1)'};
                            color: white; font-size: 14px; max-width: 80%; word-wrap: break-word;">
                    ${msg.text}
                </div>
            </div>
        `;
    }

    ,

    renderDialog: function (data) {
        return `
            <div class="chat-layout-wrapper" style="display: flex; height: 100%; width: 100%; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px); border-radius: 20px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.3);">

                <div class="chat-back" style="position: absolute; top: 20px; left: 10px; z-index: 10; color: white; cursor: pointer; padding: 10px;">
                    <i class="fa-solid fa-chevron-left"></i>
                </div>

                <aside class="chat-sidebar-mini" style="width: 70px; background: rgba(15, 23, 42, 0.8); display: flex; flex-direction: column; align-items: center; padding: 25px 0; gap: 25px; border-right: 1px solid rgba(255, 255, 255, 0.05);">
                    <div class="chat-nav-item active" style="color: #6366f1;"><i class="fa-solid fa-comment"></i></div>
                </aside>

                <main style="flex: 1; display: flex; flex-direction: column; background: rgba(30, 41, 59, 0.2);">
                    <header style="padding: 15px 20px; background: rgba(15, 23, 42, 0.4); border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <h3 style="margin:0; font-size: 14px; color: #f8fafc;">${data.name || 'Чат'}</h3>
                    </header>

                    <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 20px;">
                        ${data.messages ? data.messages.map(msg => `
                            <div style="margin-bottom: 15px; text-align: ${msg.sender === 'me' ? 'right' : 'left'}">
                                <div style="display: inline-block; padding: 10px 15px; border-radius: 12px; background: ${msg.sender === 'me' ? '#6366f1' : 'rgba(255,255,255,0.1)'}; color: white; font-size: 14px;">
                                    ${msg.text}
                                </div>
                            </div>
                        `).join('') : '<div style="color: gray; text-align: center;">Сообщений нет</div>'}
                    </div>

                    <form id="chat-form" style="padding: 15px; background: rgba(15, 23, 42, 0.3);">
                        <div style="display: flex; gap: 10px; background: #1e293b; padding: 8px 12px; border-radius: 12px;">
                            <input type="text" id="chat-input" placeholder="Сообщение..." style="flex:1; background:transparent; border:none; color:white; outline:none;">
                            <button type="submit" style="background:#6366f1; border:none; color:white; border-radius:8px; width:35px; height:35px;"><i class="fa-solid fa-paper-plane"></i></button>
                        </div>
                    </form>
                </main>
            </div>
        `;
    }
};






















