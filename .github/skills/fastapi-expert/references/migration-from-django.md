# Migration from Django/DRF Reference

## Mental model shift

| Django/DRF | FastAPI |
|------------|---------|
| `models.Model` | SQLAlchemy `DeclarativeBase` |
| `serializers.Serializer` | Pydantic `BaseModel` |
| `viewsets.ModelViewSet` | `APIRouter` + async functions |
| `urls.py` | `app.include_router()` |
| `settings.py` | Pydantic `BaseSettings` or env vars |
| `permissions` | FastAPI `Depends` + custom dependencies |

## Serializer → Schema

```python
# Django
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name"]

# FastAPI
class UserResponse(BaseModel):
    model_config = model_config(from_attributes=True)
    id: int
    email: EmailStr
    name: str | None = None
```

## ViewSet → Router

```python
# Django
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

# FastAPI
router = APIRouter(prefix="/users", tags=["users"])

@router.get("/", response_model=list[UserResponse])
async def list_users(db: DbDep, skip: int = 0, limit: int = 100) -> list[User]:
    return await crud.list_users(db, skip, limit)

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(user: UserCreate, db: DbDep) -> User:
    return await crud.create_user(db, user)
```

## Auth migration

```python
# Django
from rest_framework.permissions import IsAuthenticated

# FastAPI
from fastapi import Depends
CurrentUser = Annotated[User, Depends(get_current_user)]

@router.get("/me", response_model=UserResponse)
async def read_me(current_user: CurrentUser) -> User:
    return current_user
```

## Key differences

- FastAPI is async-first; Django is sync-first
- Pydantic schemas are separate from DB models (no `Meta` class coupling)
- Dependency injection replaces DRF's permission/serializer classes
- OpenAPI docs are auto-generated at `/docs`
