"""Oura Ring adapter — stub.

To implement:
  1. Get a Personal Access Token from cloud.ouraring.com/personal-access-tokens
  2. Store it as "oura_token" in health_sync.json
  3. Call the v2 REST API:
       GET https://api.ouraring.com/v2/usercollection/daily_readiness
       GET https://api.ouraring.com/v2/usercollection/sleep
       GET https://api.ouraring.com/v2/usercollection/daily_activity
  4. Average last 7 / 30 days and return the standard dict below.

The Oura v2 API is official and stable — unlike the Garmin adapter.
"""


def get_data(config: dict) -> dict:
    raise NotImplementedError(
        "Oura adapter is not yet implemented.\n"
        "See docs/experiments/health-sync.md and the comments in this file."
    )
