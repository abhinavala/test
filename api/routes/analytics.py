"""
Analytics API routes for the Meeting Analytics Dashboard.

Provides endpoints for:
- Health score trends over time
- Action item completion rates
- Participant engagement metrics

Supports time-based filtering (daily, weekly, monthly) and Redis caching.
"""

import hashlib
import json
import logging
from datetime import date, datetime
from typing import List, Optional

import pandas as pd
import redis
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# ---------------------------------------------------------------------------
# Dependency stubs — replace with real implementations in your app factory
# ---------------------------------------------------------------------------

def get_db() -> AsyncSession:  # pragma: no cover
    """Yield a SQLAlchemy async session. Override via FastAPI dependency injection."""
    raise NotImplementedError("get_db dependency must be provided by the application")


def get_redis() -> redis.Redis:  # pragma: no cover
    """Return a Redis client. Override via FastAPI dependency injection."""
    raise NotImplementedError("get_redis dependency must be provided by the application")


# ---------------------------------------------------------------------------
# Shared query-parameter model
# ---------------------------------------------------------------------------

VALID_PERIODS = {"daily", "weekly", "monthly"}
FREQ_MAP = {"daily": "D", "weekly": "W", "monthly": "ME"}
MAX_RANGE_DAYS = 365


class AnalyticsQuery(BaseModel):
    start_date: date
    end_date: date
    meeting_ids: Optional[List[int]] = None
    period: str = "daily"

    @validator("period")
    def validate_period(cls, v: str) -> str:
        if v not in VALID_PERIODS:
            raise ValueError(f"period must be one of {sorted(VALID_PERIODS)}")
        return v

    @validator("end_date")
    def validate_date_range(cls, v: date, values: dict) -> date:
        start = values.get("start_date")
        if start is None:
            return v
        if v < start:
            raise ValueError("end_date must be after start_date")
        if (v - start).days > MAX_RANGE_DAYS:
            raise ValueError(f"Date range cannot exceed {MAX_RANGE_DAYS} days")
        return v


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class TimeSeriesPoint(BaseModel):
    timestamp: datetime
    value: float
    count: int = 0


class HealthScoreResponse(BaseModel):
    data: List[TimeSeriesPoint]
    total_records: int
    average_score: float
    cache_hit: bool = False


class CompletionRatePoint(BaseModel):
    timestamp: datetime
    completion_rate: float
    total_items: int
    completed_items: int


class CompletionRateResponse(BaseModel):
    data: List[CompletionRatePoint]
    total_records: int
    overall_completion_rate: float
    cache_hit: bool = False


class EngagementPoint(BaseModel):
    timestamp: datetime
    engagement_score: float
    avg_participants: float
    meeting_count: int


class EngagementResponse(BaseModel):
    data: List[EngagementPoint]
    total_records: int
    average_engagement: float
    cache_hit: bool = False


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

CACHE_TTL = 3600  # 1 hour


def _cache_key(prefix: str, query: AnalyticsQuery) -> str:
    meeting_hash = hashlib.md5(
        str(sorted(query.meeting_ids or [])).encode()
    ).hexdigest()[:8]
    return ":".join([
        "analytics",
        prefix,
        query.start_date.isoformat(),
        query.end_date.isoformat(),
        query.period,
        meeting_hash,
    ])


def _try_cache_get(redis_client: redis.Redis, key: str) -> Optional[dict]:
    try:
        cached = redis_client.get(key)
        if cached:
            return json.loads(cached)
    except redis.RedisError as exc:
        logger.warning("Redis read failed (key=%s): %s", key, exc)
    return None


def _try_cache_set(redis_client: redis.Redis, key: str, data: dict) -> None:
    try:
        redis_client.setex(key, CACHE_TTL, json.dumps(data, default=str))
    except redis.RedisError as exc:
        logger.warning("Redis write failed (key=%s): %s", key, exc)


# ---------------------------------------------------------------------------
# Data-loading helpers
# ---------------------------------------------------------------------------

def _build_id_filter(meeting_ids: Optional[List[int]]) -> Optional[list]:
    return meeting_ids if meeting_ids else None


async def _load_meetings(
    session: AsyncSession,
    query: AnalyticsQuery,
) -> pd.DataFrame:
    sql = text(
        """
        SELECT
            meeting_id,
            created_at,
            health_score,
            participant_count
        FROM meetings
        WHERE created_at >= :start_date
          AND created_at <= :end_date
          AND (
              :meeting_ids IS NULL
              OR meeting_id = ANY(:meeting_ids)
          )
        """
    )
    result = await session.execute(
        sql,
        {
            "start_date": query.start_date,
            "end_date": query.end_date,
            "meeting_ids": _build_id_filter(query.meeting_ids),
        },
    )
    rows = result.fetchall()
    if not rows:
        return pd.DataFrame(
            columns=["meeting_id", "created_at", "health_score", "participant_count"]
        )
    df = pd.DataFrame(rows, columns=result.keys())
    df["created_at"] = pd.to_datetime(df["created_at"], utc=True)
    return df


async def _load_action_items(
    session: AsyncSession,
    query: AnalyticsQuery,
) -> pd.DataFrame:
    sql = text(
        """
        SELECT
            ai.action_item_id,
            ai.meeting_id,
            ai.created_at,
            ai.completed_at
        FROM action_items ai
        JOIN meetings m ON m.meeting_id = ai.meeting_id
        WHERE m.created_at >= :start_date
          AND m.created_at <= :end_date
          AND (
              :meeting_ids IS NULL
              OR ai.meeting_id = ANY(:meeting_ids)
          )
        """
    )
    result = await session.execute(
        sql,
        {
            "start_date": query.start_date,
            "end_date": query.end_date,
            "meeting_ids": _build_id_filter(query.meeting_ids),
        },
    )
    rows = result.fetchall()
    if not rows:
        return pd.DataFrame(
            columns=["action_item_id", "meeting_id", "created_at", "completed_at"]
        )
    df = pd.DataFrame(rows, columns=result.keys())
    df["created_at"] = pd.to_datetime(df["created_at"], utc=True)
    return df


# ---------------------------------------------------------------------------
# Aggregation helpers
# ---------------------------------------------------------------------------

def _resample(df: pd.DataFrame, period: str, timestamp_col: str = "created_at") -> pd.DataFrame:
    freq = FREQ_MAP[period]
    return df.set_index(timestamp_col).resample(freq)


def _empty_time_series(start: date, end: date, period: str) -> pd.DatetimeIndex:
    freq = FREQ_MAP[period]
    return pd.date_range(start=start, end=end, freq=freq, tz="UTC")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/health-scores", response_model=HealthScoreResponse)
async def get_health_score_trends(
    start_date: date = Query(..., description="Start of the date range (inclusive)"),
    end_date: date = Query(..., description="End of the date range (inclusive)"),
    period: str = Query("daily", description="Aggregation period: daily, weekly, monthly"),
    meeting_ids: Optional[List[int]] = Query(None, description="Filter by meeting IDs"),
    session: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
) -> HealthScoreResponse:
    """
    Return health score trends aggregated over the requested period.

    Each data point contains the mean health score and the number of meetings
    for that bucket. Missing buckets are returned with value=0 and count=0.
    """
    try:
        query = AnalyticsQuery(
            start_date=start_date,
            end_date=end_date,
            period=period,
            meeting_ids=meeting_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cache_key = _cache_key("health", query)
    cached = _try_cache_get(redis_client, cache_key)
    if cached:
        cached["cache_hit"] = True
        return HealthScoreResponse(**cached)

    df = await _load_meetings(session, query)

    if df.empty:
        return HealthScoreResponse(
            data=[],
            total_records=0,
            average_score=0.0,
            cache_hit=False,
        )

    resampled = (
        _resample(df, period)["health_score"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "value", "count": "count"})
        .fillna(0)
    )

    data_points = [
        TimeSeriesPoint(
            timestamp=idx,
            value=round(float(row["value"]), 2),
            count=int(row["count"]),
        )
        for idx, row in resampled.iterrows()
    ]

    avg_score = round(float(df["health_score"].mean()), 2) if not df.empty else 0.0
    response = HealthScoreResponse(
        data=data_points,
        total_records=len(df),
        average_score=avg_score,
        cache_hit=False,
    )

    _try_cache_set(redis_client, cache_key, response.dict())
    return response


@router.get("/completion-rates", response_model=CompletionRateResponse)
async def get_action_item_completion_rates(
    start_date: date = Query(..., description="Start of the date range (inclusive)"),
    end_date: date = Query(..., description="End of the date range (inclusive)"),
    period: str = Query("daily", description="Aggregation period: daily, weekly, monthly"),
    meeting_ids: Optional[List[int]] = Query(None, description="Filter by meeting IDs"),
    session: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
) -> CompletionRateResponse:
    """
    Return action item completion rates aggregated over the requested period.

    Each data point contains the completion rate (0-100%), total action items,
    and completed action items for that bucket.
    """
    try:
        query = AnalyticsQuery(
            start_date=start_date,
            end_date=end_date,
            period=period,
            meeting_ids=meeting_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cache_key = _cache_key("completion", query)
    cached = _try_cache_get(redis_client, cache_key)
    if cached:
        cached["cache_hit"] = True
        return CompletionRateResponse(**cached)

    df = await _load_action_items(session, query)

    if df.empty:
        return CompletionRateResponse(
            data=[],
            total_records=0,
            overall_completion_rate=0.0,
            cache_hit=False,
        )

    df["is_completed"] = df["completed_at"].notna().astype(int)

    freq = FREQ_MAP[period]
    agg = (
        df.set_index("created_at")
        .resample(freq)["is_completed"]
        .agg(["sum", "count"])
        .rename(columns={"sum": "completed", "count": "total"})
    )
    agg["completion_rate"] = (agg["completed"] / agg["total"].replace(0, float("nan")) * 100).fillna(0).round(2)

    data_points = [
        CompletionRatePoint(
            timestamp=idx,
            completion_rate=float(row["completion_rate"]),
            total_items=int(row["total"]),
            completed_items=int(row["completed"]),
        )
        for idx, row in agg.iterrows()
    ]

    overall_rate = round(df["is_completed"].mean() * 100, 2) if not df.empty else 0.0
    response = CompletionRateResponse(
        data=data_points,
        total_records=len(df),
        overall_completion_rate=overall_rate,
        cache_hit=False,
    )

    _try_cache_set(redis_client, cache_key, response.dict())
    return response


@router.get("/engagement", response_model=EngagementResponse)
async def get_participant_engagement(
    start_date: date = Query(..., description="Start of the date range (inclusive)"),
    end_date: date = Query(..., description="End of the date range (inclusive)"),
    period: str = Query("daily", description="Aggregation period: daily, weekly, monthly"),
    meeting_ids: Optional[List[int]] = Query(None, description="Filter by meeting IDs"),
    session: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
) -> EngagementResponse:
    """
    Return participant engagement metrics aggregated over the requested period.

    Engagement score is derived from participant count normalized against the
    average for the selected period. Each data point includes the mean
    engagement score, average participant count, and meeting count.
    """
    try:
        query = AnalyticsQuery(
            start_date=start_date,
            end_date=end_date,
            period=period,
            meeting_ids=meeting_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cache_key = _cache_key("engagement", query)
    cached = _try_cache_get(redis_client, cache_key)
    if cached:
        cached["cache_hit"] = True
        return EngagementResponse(**cached)

    df = await _load_meetings(session, query)

    if df.empty:
        return EngagementResponse(
            data=[],
            total_records=0,
            average_engagement=0.0,
            cache_hit=False,
        )

    global_mean = df["participant_count"].mean()
    global_std = df["participant_count"].std()
    if global_std and global_std > 0:
        df["engagement_score"] = (
            (df["participant_count"] - global_mean) / global_std * 10 + 50
        ).clip(0, 100).round(2)
    else:
        df["engagement_score"] = 50.0

    freq = FREQ_MAP[period]
    agg = (
        df.set_index("created_at")
        .resample(freq)
        .agg(
            engagement_score=("engagement_score", "mean"),
            avg_participants=("participant_count", "mean"),
            meeting_count=("meeting_id", "count"),
        )
        .round({"engagement_score": 2, "avg_participants": 2})
    )

    data_points = [
        EngagementPoint(
            timestamp=idx,
            engagement_score=float(row["engagement_score"]),
            avg_participants=float(row["avg_participants"]),
            meeting_count=int(row["meeting_count"]),
        )
        for idx, row in agg.iterrows()
        if row["meeting_count"] > 0
    ]

    avg_engagement = round(float(df["engagement_score"].mean()), 2)
    response = EngagementResponse(
        data=data_points,
        total_records=len(df),
        average_engagement=avg_engagement,
        cache_hit=False,
    )

    _try_cache_set(redis_client, cache_key, response.dict())
    return response


# ---------------------------------------------------------------------------
# Alias routes required by integration contracts
# ---------------------------------------------------------------------------

@router.get("/action-items", response_model=CompletionRateResponse)
async def get_action_items(
    start_date: date = Query(..., description="Start of the date range (inclusive)"),
    end_date: date = Query(..., description="End of the date range (inclusive)"),
    period: str = Query("daily", description="Aggregation period: daily, weekly, monthly"),
    meeting_ids: Optional[List[int]] = Query(None, description="Filter by meeting IDs"),
    session: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
) -> CompletionRateResponse:
    """
    Alias for /completion-rates.

    Returns action item completion rates aggregated over the requested period.
    Registered as GET /api/analytics/action-items per integration contract.
    """
    return await get_action_item_completion_rates(
        start_date=start_date,
        end_date=end_date,
        period=period,
        meeting_ids=meeting_ids,
        session=session,
        redis_client=redis_client,
    )
