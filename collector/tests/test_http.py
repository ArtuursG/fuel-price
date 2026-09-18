from collector.core.http import DEFAULT_USER_AGENT, make_client


def test_make_client_sets_user_agent_header():
    client = make_client()
    try:
        assert client.headers["User-Agent"] == DEFAULT_USER_AGENT
    finally:
        client.close()
