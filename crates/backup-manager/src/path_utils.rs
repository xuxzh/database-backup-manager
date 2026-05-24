pub fn path_slug(value: &str) -> String {
    let mut output = String::new();
    let mut pending_separator = false;

    for ch in value.trim().chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            if pending_separator && !output.is_empty() {
                output.push('-');
            }
            output.push(ch);
            pending_separator = false;
        } else {
            pending_separator = !output.is_empty();
        }
    }

    if output.is_empty() {
        "unnamed".to_string()
    } else {
        output
    }
}

#[cfg(test)]
mod tests {
    use super::path_slug;

    #[test]
    fn path_slug_normalizes_path_segments() {
        assert_eq!(path_slug("192.168.0.135"), "192-168-0-135");
        assert_eq!(path_slug(" 192.168.0.135 "), "192-168-0-135");
        assert_eq!(path_slug("135AAC---"), "135AAC");
        assert_eq!(path_slug("RH_AAC"), "RH_AAC");
        assert_eq!(path_slug("---...---"), "unnamed");
    }
}
