# Pydantic V2 Reference

## model_config

Use `model_config` instead of the old `Config` class:

```python
from pydantic import BaseModel, ConfigDict

class User(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        from_attributes=True,  # replaces orm_mode=True
        populate_by_name=True,
    )
    email: str
    name: str | None = None
```

## field_validator

Use `@field_validator` instead of `@validator`:

```python
from pydantic import BaseModel, field_validator

class UserCreate(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Invalid email")
        return v.lower()
```

## model_validator

For cross-field validation:

```python
from pydantic import BaseModel, model_validator

class DateRange(BaseModel):
    start: datetime
    end: datetime

    @model_validator(mode="after")
    def check_dates(self) -> "DateRange":
        if self.end < self.start:
            raise ValueError("end must be after start")
        return self
```

## Types

- Use `X | None` instead of `Optional[X]`
- Use `X | Y` instead of `Union[X, Y]`
- Use `list[X]` instead of `List[X]`
- Use `dict[str, int]` instead of `Dict[str, int]`

## Common patterns

```python
from pydantic import BaseModel, EmailStr, HttpUrl, Field

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    website: HttpUrl | None = None
    score: float = Field(ge=0, le=100)
```
