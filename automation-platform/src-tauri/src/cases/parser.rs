//! Turning a case folder name into a case number and a name.
//!
//! The convention is `<case number> <rest of the name>`, for example
//! `DC8842.01 Fairfax County` → `DC8842.01` / `Fairfax County`.
//!
//! The trailing text is deliberately stored as the *name*, not the
//! jurisdiction: `Fairfax County` happens to be a jurisdiction here, but
//! nothing guarantees that for every folder, and guessing wrong would put bad
//! data in a field the user cannot easily audit. `jurisdiction` stays empty
//! until a user fills it in.

/// Result of parsing one folder name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseOutcome {
    Case { case_number: String, name: String },
    /// The folder does not look like a case. Reported as a warning; the scan
    /// continues.
    Unrecognised { reason: String },
}

/// Parses a case folder name.
///
/// A folder is treated as a case when its first word contains a digit, which is
/// what separates `DC8842.01 Fairfax County` from an unrelated folder like
/// `Random Folder`. A folder with no trailing text (`DC8842.01`) keeps the case
/// number as its name.
pub fn parse_folder_name(folder_name: &str) -> ParseOutcome {
    let trimmed = folder_name.trim();

    if trimmed.is_empty() {
        return ParseOutcome::Unrecognised {
            reason: "the folder name is empty".to_string(),
        };
    }

    let mut parts = trimmed.splitn(2, char::is_whitespace);
    let case_number = parts.next().unwrap_or_default().trim();
    let remainder = parts.next().unwrap_or("").trim();

    if !case_number.chars().any(|c| c.is_ascii_digit()) {
        return ParseOutcome::Unrecognised {
            reason: format!(
                "`{case_number}` does not look like a case number (no digits), so the folder was skipped"
            ),
        };
    }

    let name = if remainder.is_empty() {
        case_number.to_string()
    } else {
        remainder.to_string()
    };

    ParseOutcome::Case {
        case_number: case_number.to_string(),
        name,
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_folder_name, ParseOutcome};

    fn parsed(name: &str) -> (String, String) {
        match parse_folder_name(name) {
            ParseOutcome::Case { case_number, name } => (case_number, name),
            other => panic!("expected `{name}` to parse as a case, got {other:?}"),
        }
    }

    #[test]
    fn parses_the_usual_shape() {
        assert_eq!(
            parsed("DC8842.01 Fairfax County"),
            ("DC8842.01".to_string(), "Fairfax County".to_string())
        );
        assert_eq!(
            parsed("DC6530.04.05 Fairfax County"),
            ("DC6530.04.05".to_string(), "Fairfax County".to_string())
        );
    }

    #[test]
    fn collapses_surrounding_and_repeated_whitespace() {
        assert_eq!(
            parsed("  DC8842.01    Fairfax County  "),
            ("DC8842.01".to_string(), "Fairfax County".to_string())
        );
    }

    #[test]
    fn falls_back_to_the_case_number_when_there_is_no_trailing_text() {
        assert_eq!(
            parsed("DC8842.01"),
            ("DC8842.01".to_string(), "DC8842.01".to_string())
        );
    }

    #[test]
    fn rejects_folders_without_a_number_like_first_word() {
        assert!(matches!(
            parse_folder_name("Random Folder"),
            ParseOutcome::Unrecognised { .. }
        ));
        assert!(matches!(
            parse_folder_name("Archive"),
            ParseOutcome::Unrecognised { .. }
        ));
        assert!(matches!(
            parse_folder_name("   "),
            ParseOutcome::Unrecognised { .. }
        ));
    }

    #[test]
    fn accepts_other_numbering_conventions() {
        assert_eq!(
            parsed("2024-118 Some Project"),
            ("2024-118".to_string(), "Some Project".to_string())
        );
    }
}
