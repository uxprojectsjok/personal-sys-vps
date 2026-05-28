"""Apple Health adapter — stub.

To implement:
  1. Export from iOS Health app: Share > Export All Health Data → export.zip
  2. Upload export/apple_health_export/export.xml to the server
  3. Parse XML: <Record type="HKQuantityTypeIdentifierRestingHeartRate" ...>
                <Record type="HKCategoryTypeIdentifierSleepAnalysis" ...>
                <Record type="HKQuantityTypeIdentifierStepCount" ...>
  4. Average last 7 / 30 days and return the standard dict below.

This is manual (no live sync). Automate with Shortcuts → SSH or a webhook.
"""


def get_data(config: dict) -> dict:
    raise NotImplementedError(
        "Apple Health adapter is not yet implemented.\n"
        "See docs/experiments/health-sync.md and the comments in this file."
    )
