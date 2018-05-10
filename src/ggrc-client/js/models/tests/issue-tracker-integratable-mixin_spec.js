/*
  Copyright (C) 2018 Google Inc.
  Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
*/

import * as queryApiUtils from '../../plugins/utils/query-api-utils';

describe('can.Model.Mixin.issueTrackerIntegratable', function () {
  'use strict';

  let Mixin;
  let audit;
  let assessment;

  beforeAll(function () {
    GGRC.ISSUE_TRACKER_ENABLED = true;
    Mixin = CMS.Models.Mixins.issueTrackerIntegratable;
  });

  describe('ensureParentAudit() method: ', function () {
    let method;

    beforeEach(function () {
      audit = new can.Map({
        id: 123,
        title: 'Audit',
        type: 'Audit',
      });
      assessment = new can.Map({
        audit,
      });
      method = Mixin.prototype.ensureParentAudit;
    });

    it('should resolve to assigned audit property', function (done) {
      method.apply(assessment).then((resolvedAudit) => {
        expect(resolvedAudit).toEqual(audit);
        done();
      });
    });

    it('should resolve to audit from page_instance', function (done) {
      spyOn(GGRC, 'page_instance')
        .and.returnValue(audit);

      assessment.isNew = () => true;
      assessment.attr('audit', null);

      method.apply(assessment).then((resolvedAudit) => {
        expect(resolvedAudit).toEqual(audit);
        done();
      });
    });

    it('should fetch audit from server if not assigned and not in' +
       ' page_instance', function (done) {
      spyOn(GGRC, 'page_instance')
        .and.returnValue({ });

      let dfd = new can.Deferred();
      dfd.resolve(_.set({}, '[0].Audit.values[0]', audit));
      spyOn(queryApiUtils, 'makeRequest').and.returnValue(dfd);

      assessment.attr('audit', null);
      assessment.isNew = () => false;

      method.apply(assessment).then((resolvedAudit) => {
        expect(queryApiUtils.makeRequest).toHaveBeenCalled();
        expect(resolvedAudit).toEqual(audit);
        done();
      });
    });
  });

  describe('"after:init" event', () => {
    const auditProto = CMS.Models.Audit.prototype;
    const asmtProto = CMS.Models.Assessment.prototype;

    it('should call "initAuditIssueTracker" for audit', () => {
      spyOn(auditProto, 'initAuditIssueTracker');
      new CMS.Models.Audit({type: 'Audit'});
      expect(auditProto.initAuditIssueTracker).toHaveBeenCalled();
    });

    it('should call "initIssueTrackerForAssessment" for audit', () => {
      let dfd = new can.Deferred();
      dfd.resolve(audit);
      spyOn(asmtProto, 'ensureParentAudit').and.returnValue(dfd);
      spyOn(asmtProto, 'initIssueTrackerForAssessment');
      new CMS.Models.Assessment({type: 'Assessment'});
      expect(asmtProto.initIssueTrackerForAssessment).toHaveBeenCalled();
    });
  });

  describe('initAuditIssueTracker() method', () => {
    let method;

    beforeAll(() => {
      method = Mixin.prototype.initAuditIssueTracker;
    });

    it('should show issue tracker on audit if globally enabled and'+
       ' turn off by default', () => {
      GGRC.ISSUE_TRACKER_ENABLED = true;
      const auditStub = {
        type: 'Audit',
        initIssueTrackerObject: jasmine.createSpy(),
      };
      method.apply(auditStub);

      expect(auditStub.initIssueTrackerObject.calls.count()).toEqual(1);
      const callArgs = auditStub.initIssueTrackerObject
        .calls.mostRecent().args;

      expect(callArgs[0].enabled).toEqual(false); // turn off by default
      expect(callArgs[1]).toEqual(true); // show issue tracker controls
    });

    it('should hide issue tracker on audit if globally disabled and'+
       ' turn off by default', () => {
      GGRC.ISSUE_TRACKER_ENABLED = false;
      const auditStub = {
        type: 'Audit',
        initIssueTrackerObject: jasmine.createSpy(),
      };
      method.apply(auditStub);

      expect(auditStub.initIssueTrackerObject.calls.count()).toEqual(1);
      const callArgs = auditStub.initIssueTrackerObject
        .calls.mostRecent().args;

      expect(callArgs[0].enabled).toEqual(false); // turn off by default
      expect(callArgs[1]).toEqual(false); // show issue tracker controls
    });
  });

  describe('initIssueTrackerForAssessment() method [new assessment]', () => {
    let method;
    let fakeAssessment;
    let fakeAudit;

    beforeAll(() => {
      method = Mixin.prototype.initIssueTrackerForAssessment;
    });

    beforeEach(() => {
      fakeAudit = new can.Map({
        id: 1,
        type: 'Audit',
        issue_tracker: {
          enabled: true,
        },
      });
      fakeAssessment = new can.Map({
        audit: fakeAudit,
        issue_tracker: {
          enabled: null,
        },
        initIssueTrackerObject: jasmine.createSpy(),
        isNew() {
          return !this.id;
        },
      });
    });

    it('should show ITR if enabled in audit',
      () => {
        fakeAssessment.attr('audit.issue_tracker.enabled', true);
        method.apply(fakeAssessment);

        const itrShowControls = fakeAssessment.initIssueTrackerObject
          .calls.mostRecent().args[1];
        expect(itrShowControls).toEqual(true); // show issue tracker controls
      });

    it('should hide ITR if disabled in audit',
      () => {
        fakeAssessment.attr('audit.issue_tracker.enabled', false);
        method.apply(fakeAssessment);

        const itrShowControls = fakeAssessment.initIssueTrackerObject
          .calls.mostRecent().args[1];
        expect(itrShowControls).toEqual(false); // show issue tracker controls
      });

    it('should enable ITR if enabled in audit', () => {
      fakeAssessment.attr('audit.issue_tracker.enabled', true);
      method.apply(fakeAssessment);

      const itrConfig = fakeAssessment.initIssueTrackerObject
        .calls.mostRecent().args[0];

      expect(itrConfig.enabled).toEqual(true); // turn on by default for assessment
    });

    it('should disable ITR if disable in audit', () => {
      fakeAssessment.attr('audit.issue_tracker.enabled', false);
      method.apply(fakeAssessment);

      const itrConfig = fakeAssessment.initIssueTrackerObject
        .calls.mostRecent().args[0];

      expect(itrConfig.enabled).toEqual(false); // turn on by default for assessment
    });
  });

  describe('initIssueTrackerForAssessment() method [existing assessment]',
    () => {
      let method;
      let fakeAssessment;
      let fakeAudit;

      beforeAll(() => {
        method = Mixin.prototype.initIssueTrackerForAssessment;
      });

      beforeEach(() => {
        fakeAudit = new can.Map({
          id: 1,
          type: 'Audit',
          issue_tracker: {
            enabled: true,
          },
        });
        fakeAssessment = new can.Map({
          id: 123,
          audit: fakeAudit,
          issue_tracker: {
            enabled: null,
          },
          initIssueTrackerObject: jasmine.createSpy(),
          isNew() {
            return !this.id;
          },
        });
      });

      it('should show ITR if if enabled on instance regardless of audit\'s ' +
        'ITR config', () => {
        let itrShowControls;
        fakeAssessment.attr('issue_tracker.enabled', true);

        // enabled in Audit
        fakeAssessment.attr('audit.issue_tracker.enabled', true);
        method.apply(fakeAssessment);
        itrShowControls = fakeAssessment.initIssueTrackerObject
          .calls.mostRecent().args[1];
        expect(itrShowControls).toEqual(true);

        // disabled in Audit
        fakeAssessment.attr('audit.issue_tracker.enabled', false);
        method.apply(fakeAssessment);
        itrShowControls = fakeAssessment.initIssueTrackerObject
          .calls.mostRecent().args[1];
        expect(itrShowControls).toEqual(true);
      });

      it('should show ITR if enabled on instance and disabled in audit',
        () => {
          let itrShowControls;
          fakeAssessment.attr('issue_tracker.enabled', true);

          // disabled in Audit
          fakeAssessment.attr('audit.issue_tracker.enabled', false);
          method.apply(fakeAssessment);
          itrShowControls = fakeAssessment.initIssueTrackerObject
            .calls.mostRecent().args[1];
          expect(itrShowControls).toEqual(true);
        });

      it('should enable ITR if it is enabled in issue_tracker',
        () => {
          let enabled;
          fakeAssessment.attr('issue_tracker.enabled', true);
          method.apply(fakeAssessment);
          // value should have been taken from .issues_tracker.enabled
          enabled = fakeAssessment.initIssueTrackerObject
            .calls.mostRecent().args[0].enabled;
          expect(enabled).toEqual(true);
        });

      it('should disable ITR if it is disabled in issue_tracker',
        () => {
          let enabled;
          fakeAssessment.attr('issue_tracker.enabled', false);
          method.apply(fakeAssessment);
          // value should have been taken from .issues_tracker.enabled
          enabled = fakeAssessment.initIssueTrackerObject
            .calls.mostRecent().args[0].enabled;
          expect(enabled).toEqual(false);
        });

      it('should hide ITR if disabled on instance and in audit',
        () => {
          let itrShowControls;
          fakeAssessment.attr('issue_tracker.enabled', false);

          // disabled in Audit
          fakeAssessment.attr('audit.issue_tracker.enabled', false);
          method.apply(fakeAssessment);
          itrShowControls = fakeAssessment.initIssueTrackerObject
            .calls.mostRecent().args[1];
          expect(itrShowControls).toEqual(false);
        });
    });

  describe('initIssueTrackerObject() method',
    () => {
      let method;
      let fakeAssessment;

      beforeAll(() => {
        method = Mixin.prototype.initIssueTrackerObject;
      });

      beforeEach(() => {
        fakeAssessment = new can.Map({
          id: 123,
          issue_tracker: null,
          can_use_issue_tracker: null,
          isNew() {
            return !this.id;
          },
        });
      });

      it('should not apply ITR config if globally disabled', () => {
        GGRC.ISSUE_TRACKER_ENABLED = false;
        method.call(fakeAssessment, {enabled: true}, true);

        expect(fakeAssessment.issue_tracker).toEqual(null);
        expect(fakeAssessment.can_use_issue_tracker).toEqual(null);
      });

      it('should not apply ITR config if already on instance', () => {
        GGRC.ISSUE_TRACKER_ENABLED = false;

        let existingConfig = {
          component_id: '123123123',
          enabled: false,
        };

        fakeAssessment.attr('issue_tracker', existingConfig);

        method.call(fakeAssessment, {enabled: true}, true);

        expect(fakeAssessment.issue_tracker.enabled)
          .toEqual(existingConfig.enabled);
      });
    });
});
