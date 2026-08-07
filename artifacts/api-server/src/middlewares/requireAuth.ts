import { createRemoteJWKSet, jwtVerify } from "jose";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function jwksUri(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_URL must be set to verify authentication tokens.");
  }
  return `${url.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
}

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUri()));
  }
  return jwks;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Necesitas iniciar sesión para continuar." });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ["ES256", "RS256", "HS256"],
    });
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId || payload.role !== "authenticated") {
      res.status(401).json({ error: "Necesitas iniciar sesión para continuar." });
      return;
    }
    req.userId = userId;
    req.userEmail = typeof payload.email === "string" ? payload.email : undefined;
    next();
  } catch {
    res.status(401).json({ error: "Necesitas iniciar sesión para continuar." });
  }
}
