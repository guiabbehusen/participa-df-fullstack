from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Dict, Optional

from .models import ManifestationRecord


@dataclass
class InMemoryStore:
    """Store simples em memória para hackathon.

    Produção: usar banco (Postgres/...) + fila de processamento.
    """

    _data: Dict[str, ManifestationRecord]
    _lock: Lock

    def __init__(self) -> None:
        self._data = {}
        self._lock = Lock()

    def create(self, record: ManifestationRecord) -> None:
        with self._lock:
            self._data[record.protocol] = record

    def get(self, protocol: str) -> Optional[ManifestationRecord]:
        with self._lock:
            return self._data.get(protocol)


STORE = InMemoryStore()
