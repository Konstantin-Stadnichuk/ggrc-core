# Copyright (C) 2015 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By: andraz@reciprocitylabs.com
# Maintained By: andraz@reciprocitylabs.com

import logging
from collections import namedtuple

from sqlalchemy import or_, and_

from ggrc import models
from ggrc.models.relationship import Relationship
from ggrc.services.common import Resource
from ggrc import db
from ggrc.automapper.rules import rules
from ggrc.utils import benchmark


Stub = namedtuple("Stub", ["type", "id"])
stub_from_source = lambda r: Stub(r.source_type, r.source_id)
stub_from_destination = lambda r: Stub(r.destination_type, r.destination_id)


class AutomapperGenerator(object):
  def __init__(self, relationship):
    self.relationship = relationship
    self.processed = set()
    self.queue = set()
    self.cache = dict()

  def related(self, obj):
    if obj in self.cache:
      return self.cache[obj]
    relationships = Relationship.query.filter(or_(
        and_(Relationship.source_type == obj.type,
             Relationship.source_id == obj.id),
        and_(Relationship.destination_type == obj.type,
             Relationship.destination_id == obj.id),
    )).all()
    res = set((stub_from_destination(r)
               if r.source_type == obj.type and r.source_id == obj.id
               else stub_from_source(r))
              for r in relationships)
    self.cache[obj] = res
    return res

  def relate(self, src, dst):
    if src < dst:
      return (src, dst)
    else:
      return (dst, src)

  def generate_automappings(self):
    with benchmark("Automapping generate_automappings"):
      self.queue.add(self.relate(stub_from_source(self.relationship),
                     stub_from_destination(self.relationship)))
      count = 0
      while len(self.queue) > 0:
        count += 1
        src, dst = entry = self.queue.pop()
        # TODO check that user can see both objects
        self._ensure_relationship(src, dst)
        self.processed.add(entry)
        with benchmark("Automapping _step: %d" % count):
          self._step(src, dst)
          self._step(dst, src)

  def _step(self, src, dst):
      explicit, implicit = rules[src.type, dst.type]
      self._step_explicit(src, dst, explicit)
      self._step_implicit(src, dst, implicit)

  def _step_explicit(self, src, dst, explicit):
    if len(explicit) != 0:
      src_related = (o for o in self.related(src)
                     if o.type in explicit and o != dst)
      for r in src_related:
        entry = self.relate(r, dst)
        if entry not in self.processed:
          self.queue.add(entry)

  def _step_implicit(self, src, dst, implicit):
    if not hasattr(models, src.type):
      logging.warning('Automapping by attr: cannot find model %s' % src.type)
      return
    model = getattr(models, src.type)
    instance = model.query.filter(model.id == src.id).first()
    if instance is None:
      logging.warning("Automapping by attr: cannot load model %s: %s" %
                      (src.type, str(src.id)))
      return
    for attr in implicit:
      if hasattr(instance, attr.name):
        value = getattr(instance, attr.name)
        if value is not None:
          entry = self.relate(Stub(value.type, value.id), dst)
          if entry not in self.processed:
            self.queue.add(entry)
        else:
          logging.warning('Automapping by attr: %s is None' % attr.name)
      else:
        logging.warning(
            'Automapping by attr: object %s has no attribute %s' %
            (str(src), str(attr.name))
        )

  def _ensure_relationship(self, src, dst):
    if Relationship.find_related(src, dst) is None:
      db.session.add(Relationship(
          source_type=src.type,
          source_id=src.id,
          destination_type=dst.type,
          destination_id=dst.id,
          automapping_id=self.relationship.id
      ))
      if src in self.cache:
        self.cache[src].add(dst)
      if dst in self.cache:
        self.cache[dst].add(src)


def register_automapping_listeners():
  @Resource.model_posted.connect_via(Relationship)
  def handle_relationship_post(sender, obj=None, src=None, service=None):
    if obj is None:
      logging.warning("Automapping listener: no obj, no mappings created")
      return
    AutomapperGenerator(obj).generate_automappings()
