from ratelimit import SlidingWindow


def test_allows_up_to_the_limit_then_refuses_until_the_window_passes():
    t = [0.0]
    w = SlidingWindow(limit=3, window_s=600, now=lambda: t[0])
    assert [w.allow("ip") for _ in range(4)] == [True, True, True, False]
    t[0] = 601
    assert w.allow("ip") is True


def test_keys_are_independent():
    w = SlidingWindow(limit=1, window_s=600, now=lambda: 0.0)
    assert w.allow("a") and w.allow("b") and not w.allow("a")


def test_tracked_keys_are_capped_dropping_the_oldest():
    w = SlidingWindow(limit=1, window_s=600, now=lambda: 0.0)
    for i in range(10_005):
        w.allow(f"ip{i}")
    assert len(w._hits) <= 10_000
    assert w.allow("ip0") is True  # oldest was dropped, so it is fresh again
