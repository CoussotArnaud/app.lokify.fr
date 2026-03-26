import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import env from "../config/env.js";
import HttpError from "../utils/http-error.js";

const projectRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const outboxDir = path.join(projectRoot, ".lokify-runtime", "mail-outbox");

let smtpTransporterPromise = null;

const sanitizeFileFragment = (value) =>
  String(value || "mail")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "mail";

const getSmtpTransporter = async () => {
  if (smtpTransporterPromise) {
    return smtpTransporterPromise;
  }

  smtpTransporterPromise = (async () => {
    if (!env.smtpHost) {
      throw new HttpError(500, "Transport email SMTP non configure.");
    }

    const nodemailerModule = await import("nodemailer").catch(() => null);

    if (!nodemailerModule) {
      throw new HttpError(
        500,
        "Le module d'envoi email n'est pas disponible. Installez la dependance nodemailer."
      );
    }

    const nodemailer = nodemailerModule.default || nodemailerModule;

    return nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth:
        env.smtpUser || env.smtpPassword
          ? {
              user: env.smtpUser,
              pass: env.smtpPassword,
            }
          : undefined,
    });
  })();

  return smtpTransporterPromise;
};

const logEmailToOutbox = async ({ to, subject, text, html }) => {
  await fs.mkdir(outboxDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${timestamp}-${sanitizeFileFragment(to)}.json`;
  const filePath = path.join(outboxDir, fileName);

  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        to,
        from: env.mailFrom,
        subject,
        text,
        html,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    deliveryMode: "log",
    deliveryReference: filePath,
  };
};

export const deliverEmail = async ({ to, subject, text, html }) => {
  if (env.mailTransportMode === "smtp") {
    const transporter = await getSmtpTransporter();
    const info = await transporter.sendMail({
      from: env.mailFrom,
      to,
      subject,
      text,
      html,
    });

    return {
      deliveryMode: "smtp",
      deliveryReference: info.messageId || null,
    };
  }

  return logEmailToOutbox({ to, subject, text, html });
};

