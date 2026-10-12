from fastapi import APIRouter, HTTPException, Query, Request

from tasteshift.domain import Category

router = APIRouter(prefix="/api/entities")


@router.get("/search")
async def search(
    request: Request,
    q: str = Query(min_length=2, max_length=120),
    category: Category = Category.artist,
):
    if len(q.strip()) < 2:
        raise HTTPException(422, "Enter at least two characters")
    return {"items": await request.app.state.qloo.search(q.strip(), category)}
