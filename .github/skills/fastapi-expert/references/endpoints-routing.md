# Endpoints & Routing Reference

## APIRouter

```python
from fastapi import APIRouter

router = APIRouter(
    prefix="/items",
    tags=["items"],
    dependencies=[Depends(get_current_user)],
    responses={404: {"description": "Not found"}},
)
```

## Path parameters

```python
@router.get("/{item_id}")
async def read_item(item_id: int, db: DbDep) -> ItemResponse:
    return await crud.get_item(db, item_id)
```

## Query parameters

```python
@router.get("/")
async def list_items(
    db: DbDep,
    skip: int = 0,
    limit: int = 100,
    category: str | None = None,
) -> list[ItemResponse]:
    return await crud.list_items(db, skip, limit, category)
```

## Request body

```python
from fastapi import Body

@router.post("/")
async def create_item(
    item: ItemCreate,
    db: DbDep,
    extra: str = Body(..., embed=True),
) -> ItemResponse:
    ...
```

## Response models

Always use `response_model` to control output:

```python
@router.get("/{item_id}", response_model=ItemResponse)
async def read_item(item_id: int, db: DbDep) -> Item:
    item = await crud.get_item(db, item_id)
    return item  # FastAPI will serialize to ItemResponse
```

## Status codes

```python
from fastapi import status

@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(item: ItemCreate, db: DbDep) -> ItemResponse:
    ...
```

## Error handling

```python
from fastapi import HTTPException, status

@router.get("/{item_id}")
async def read_item(item_id: int, db: DbDep) -> ItemResponse:
    item = await crud.get_item(db, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item
```

## Include routers

```python
from fastapi import FastAPI
from app.routers import users, items

app = FastAPI()
app.include_router(users.router, prefix="/api/v1")
app.include_router(items.router, prefix="/api/v1")
```
