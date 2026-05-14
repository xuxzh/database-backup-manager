use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use anyhow::{Context, anyhow};
use base64::{Engine, engine::general_purpose::STANDARD};
use rand::RngCore;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone)]
pub struct Crypto {
    key: [u8; 32],
}

impl Crypto {
    pub fn new(secret: &str) -> anyhow::Result<Self> {
        if secret.trim().is_empty() {
            return Err(anyhow!("APP_SECRET must not be empty"));
        }
        let digest = Sha256::digest(secret.as_bytes());
        let mut key = [0u8; 32];
        key.copy_from_slice(&digest);
        Ok(Self { key })
    }

    pub fn encrypt(&self, plaintext: &str) -> anyhow::Result<String> {
        let cipher =
            Aes256Gcm::new_from_slice(&self.key).map_err(|_| anyhow!("invalid encryption key"))?;
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|_| anyhow!("encryption failed"))?;
        Ok(format!(
            "{}.{}",
            STANDARD.encode(nonce_bytes),
            STANDARD.encode(ciphertext)
        ))
    }

    pub fn decrypt(&self, value: &str) -> anyhow::Result<String> {
        let (nonce_b64, ciphertext_b64) =
            value.split_once('.').context("invalid encrypted value")?;
        let nonce = STANDARD.decode(nonce_b64)?;
        let ciphertext = STANDARD.decode(ciphertext_b64)?;
        let cipher =
            Aes256Gcm::new_from_slice(&self.key).map_err(|_| anyhow!("invalid encryption key"))?;
        let plaintext = cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|_| anyhow!("decryption failed"))?;
        String::from_utf8(plaintext).context("decrypted value is not utf-8")
    }
}

#[cfg(test)]
mod tests {
    use super::Crypto;

    #[test]
    fn encrypt_roundtrip() {
        let crypto = Crypto::new("secret").unwrap();
        let encrypted = crypto.encrypt("password").unwrap();
        assert_ne!(encrypted, "password");
        assert_eq!(crypto.decrypt(&encrypted).unwrap(), "password");
    }
}
