# daily-xi web (static Expo export served by Caddy) — Railway-ready.
# Build args become the client bundle's env (anon key only — NEVER service role).

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ARG INVITE_CODE
ARG EXPO_PUBLIC_VAPID_KEY
ARG EXPO_PUBLIC_SENTRY_DSN
ARG EXPO_PUBLIC_KLIPY_KEY
ENV SUPABASE_URL=$SUPABASE_URL \
    SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY \
    INVITE_CODE=$INVITE_CODE \
    EXPO_PUBLIC_VAPID_KEY=$EXPO_PUBLIC_VAPID_KEY \
    EXPO_PUBLIC_SENTRY_DSN=$EXPO_PUBLIC_SENTRY_DSN \
    EXPO_PUBLIC_KLIPY_KEY=$EXPO_PUBLIC_KLIPY_KEY
RUN npx expo export --platform web

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
