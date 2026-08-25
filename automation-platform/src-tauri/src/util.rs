//! Small helpers shared across modules.

use std::time::{SystemTime, UNIX_EPOCH};

/// Current UTC time as an ISO-8601 string, e.g. `2026-08-23T18:08:58Z`.
///
/// The database produces its own timestamps with `datetime('now')`; this exists
/// for the JSON files (workspace metadata, application preferences), which have
/// no SQLite connection to borrow. Implemented directly rather than pulling in a
/// date-time crate for one function.
pub fn now_iso8601() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    format_iso8601(seconds)
}

/// Formats a Unix timestamp (seconds) as an ISO-8601 UTC string.
pub fn format_iso8601(unix_seconds: i64) -> String {
    let days = unix_seconds.div_euclid(86_400);
    let seconds_of_day = unix_seconds.rem_euclid(86_400);

    let (year, month, day) = civil_from_days(days);
    let (hour, minute, second) = (
        seconds_of_day / 3600,
        (seconds_of_day % 3600) / 60,
        seconds_of_day % 60,
    );

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

/// Converts a count of days since the Unix epoch into a civil (year, month, day).
///
/// Howard Hinnant's `civil_from_days`, which is the standard branch-free
/// formulation of this conversion and valid for the whole proleptic Gregorian
/// calendar.
fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    // Shift the epoch to 0000-03-01 so leap days land at the end of the cycle.
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = (z - era * 146_097) as i64; // [0, 146096]
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365; // [0, 399]
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100); // [0, 365]
    let mp = (5 * day_of_year + 2) / 153; // [0, 11], March = 0
    let day = (day_of_year - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]

    (if month <= 2 { year + 1 } else { year }, month, day)
}

#[cfg(test)]
mod tests {
    use super::format_iso8601;

    #[test]
    fn formats_known_timestamps() {
        assert_eq!(format_iso8601(0), "1970-01-01T00:00:00Z");
        assert_eq!(format_iso8601(1), "1970-01-01T00:00:01Z");
        assert_eq!(format_iso8601(86_399), "1970-01-01T23:59:59Z");
        assert_eq!(format_iso8601(86_400), "1970-01-02T00:00:00Z");
        // Leap day.
        assert_eq!(format_iso8601(1_709_164_800), "2024-02-29T00:00:00Z");
        assert_eq!(format_iso8601(1_756_000_138), "2025-08-24T01:48:58Z");
    }
}
