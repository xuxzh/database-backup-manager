use std::{
    collections::HashSet,
    sync::{Arc, RwLock},
};

use axum::{
    extract::{FromRef, FromRequestParts},
    http::{StatusCode, request::Parts},
};
use rand::RngCore;

#[derive(Debug, Default)]
pub struct SessionStore {
    tokens: RwLock<HashSet<String>>,
}

impl SessionStore {
    pub fn create(&self) -> String {
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        let token = hex::encode(bytes);
        self.tokens
            .write()
            .expect("session lock poisoned")
            .insert(token.clone());
        token
    }

    pub fn contains(&self, token: &str) -> bool {
        self.tokens
            .read()
            .expect("session lock poisoned")
            .contains(token)
    }
}

#[derive(Debug, Clone)]
pub struct Authenticated;

impl<S> FromRequestParts<S> for Authenticated
where
    Arc<SessionStore>: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = (StatusCode, &'static str);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let sessions = Arc::<SessionStore>::from_ref(state);
        let Some(header) = parts.headers.get("authorization") else {
            return Err((StatusCode::UNAUTHORIZED, "missing authorization"));
        };
        let Ok(value) = header.to_str() else {
            return Err((StatusCode::UNAUTHORIZED, "invalid authorization"));
        };
        let Some(token) = value.strip_prefix("Bearer ") else {
            return Err((StatusCode::UNAUTHORIZED, "invalid authorization"));
        };
        if sessions.contains(token) {
            Ok(Self)
        } else {
            Err((StatusCode::UNAUTHORIZED, "invalid token"))
        }
    }
}
