from pydantic import BaseModel, Field


class Node(BaseModel):
    id: str
    label: str
    summary: str | None = None
    parent_id: str | None = None


class Edge(BaseModel):
    source_id: str
    target_id: str
    relation: str


class MindMap(BaseModel):
    title: str
    nodes: list[Node]
    edges: list[Edge] = Field(default_factory=list)


class Document(BaseModel):
    text: str
    metadata: dict = Field(default_factory=dict)
