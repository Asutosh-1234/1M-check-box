import passport from "passport";
import { getState } from "./checkboxState.js";

export function setupRoutes(app) {
  app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  app.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/?error=auth_failed" }),
    (req, res) => res.redirect("/")
  );

  app.get("/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.redirect("/");
    });
  });

  app.get("/auth/me", (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({
      user: {
        id: req.user.id,
        displayName: req.user.display_name,
        email: req.user.email,
        avatar: req.user.avatar,
      },
    });
  });

  app.get("/state", async (req, res) => {
    const state = await getState();
    res.json({ state });
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));
}
