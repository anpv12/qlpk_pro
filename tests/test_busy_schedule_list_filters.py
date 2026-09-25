"""Exercise the actual read handler against an isolated in-memory database."""
import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest

from flask import Flask, jsonify, request
from sqlalchemy import Column, DateTime, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, Session

Base = declarative_base()


class Schedule(Base):
    __tablename__ = 'schedules'
    id = Column(Integer, primary_key=True)
    doctor_id = Column(Integer)
    status = Column(String)
    start_datetime = Column(DateTime)
    end_datetime = Column(DateTime)

    def to_dict(self):
        return {'id': self.id}


class BusyScheduleListFiltersTest(unittest.TestCase):
    def test_status_filters_keep_owner_and_expose_history(self):
        engine = create_engine('sqlite://')
        Base.metadata.create_all(engine)
        now = datetime.now(timezone.utc)
        with Session(engine) as db:
            for ident, owner, status, days in [(1, 1, 'active', 1), (2, 1, 'active', -2),
                                               (3, 1, 'cancelled', -2), (4, 2, 'active', 1)]:
                db.add(Schedule(id=ident, doctor_id=owner, status=status,
                                start_datetime=now + timedelta(days=days),
                                end_datetime=now + timedelta(days=days, hours=1)))
            db.commit()
        source = Path(__file__).resolve().parents[1] / 'app/api/doctor_busy_schedule.py'
        handler = next(node for node in ast.parse(source.read_text()).body
                       if isinstance(node, ast.FunctionDef) and node.name == 'get_my_busy_schedules')
        handler.decorator_list = []
        namespace = dict(get_db=lambda: iter([Session(engine)]), DoctorBusySchedule=Schedule,
                         request=request, jsonify=jsonify, datetime=datetime, timezone=timezone)
        exec(compile(ast.Module(body=[handler], type_ignores=[]), str(source), 'exec'), namespace)
        app = Flask(__name__)
        for query, expected in [('', {1}), ('?status=active', {1}),
                                ('?status=all', {1, 2, 3}), ('?status=cancelled', {3})]:
            with self.subTest(query=query), app.test_request_context('/' + query):
                response, status = namespace['get_my_busy_schedules'](SimpleNamespace(id=1))
                self.assertEqual(status, 200)
                self.assertEqual({row['id'] for row in response.json['data']}, expected)
        engine.dispose()


if __name__ == '__main__':
    unittest.main()
