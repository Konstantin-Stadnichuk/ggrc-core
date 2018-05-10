/*
    Copyright (C) 2018 Google Inc.
    Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
*/

import {
  buildParam,
  makeRequest,
  batchRequests,
} from '../plugins/utils/query-api-utils';
import {confirm} from '../plugins/utils/modals';
import {isSnapshot} from '../plugins/utils/snapshot-utils';
import {REFRESH_PROPOSAL_DIFF} from '../events/eventTypes';

const AUDIT_ISSUE_TRACKER = {
  hotlist_id: '766459',
  component_id: '188208',
  issue_severity: 'S2',
  issue_priority: 'P2',
  issue_type: 'PROCESS',
};


(function (can, GGRC) {
  can.Construct.extend('can.Model.Mixin', {
    extend: function (fullName, klass, proto) {
      let tempname;
      let mixinName;
      let parts;
      let shortName;
      let Constructor;

      if (typeof fullName === 'string') {
        // Mixins do not go into the global namespace.
        tempname = fullName;
        fullName = '';
      }
      Constructor = this._super(fullName, klass, proto);

      // instead mixins sit under CMS.Models.Mixins
      if (tempname) {
        parts = tempname.split('.');
        shortName = parts.pop();
        Constructor.fullName = tempname;
      } else {
        Constructor.fullName = shortName =
          'Mixin_' + Math.floor(Math.random() * Math.pow(36, 8)).toString(36);
        parts = [];
      }
      mixinName = 'CMS.Models.Mixins' + (parts.length ?
        '.' + parts.join('.') :
        '');
      can.getObject(mixinName, window, true)[shortName] = Constructor;
      return Constructor;
    },
    newInstance: function () {
      throw new Error('Mixins cannot be directly instantiated');
    },
    add_to: function (cls) {
      if (this === can.Model.Mixin) {
        throw new Error('Must only add a subclass of Mixin to an object,' +
          ' not Mixin itself');
      }
      function setupFns(obj) {
        return function (fn, key) {
          let blockedKeys = ['fullName', 'defaults', '_super', 'constructor'];
          let aspect = ~key.indexOf(':') ?
            key.substr(0, key.indexOf(':')) :
            'after';
          let oldfn;

          key = ~key.indexOf(':') ? key.substr(key.indexOf(':') + 1) : key;
          if (fn !== can.Model.Mixin[key] && !~can.inArray(key, blockedKeys)) {
            oldfn = obj[key];
            // TODO support other ways of adding functions.
            //  E.g. "override" (doesn't call super fn at all)
            //       "sub" (sets this._super for mixin function)
            //       "chain" (pushes result of oldfn onto args)
            //       "before"/"after" (overridden function)
            // TODO support extension for objects.
            //   Necessary for "attributes"/"serialize"/"convert"
            // Defaults will always be "after" for functions
            //  and "override" for non-function values
            if (can.isFunction(oldfn)) {
              switch (aspect) {
                case 'before':
                  obj[key] = function () {
                    fn.apply(this, arguments);
                    return oldfn.apply(this, arguments);
                  };
                  break;
                case 'after':
                  obj[key] = function () {
                    let result;
                    result = oldfn.apply(this, arguments);
                    fn.call(this, result);
                    return result;
                  };
                  break;
                default:
                  break;
              }
            } else if (aspect === 'extend') {
              obj[key] = can.extend(obj[key], fn);
            } else {
              obj[key] = fn;
            }
          }
        };
      }

      if (!~can.inArray(this.fullName, cls._mixins)) {
        cls._mixins = cls._mixins || [];
        cls._mixins.push(this.fullName);
        Object.keys(this).forEach(function (key) {
          setupFns(cls)(this[key], key);
        }.bind(this));
        can.each(this.prototype, setupFns(cls.prototype));
      }
    },
  }, {});
  can.Model.Mixin('requestorable', {
    before_create: function () {
      if (!this.requestor) {
        this.attr('requestor', {
          id: GGRC.current_user.id,
          type: 'Person',
        });
      }
    },
    form_preload: function (new_object_form) {
      if (new_object_form) {
        if (!this.requestor) {
          this.attr('requestor', {
            id: GGRC.current_user.id,
            type: 'Person',
          });
        }
      }
    },
  });

  can.Model.Mixin('ownable', {
    'after:init': function () {
      if (!this.owners) {
        this.attr('owners', []);
      }
    },
  });

  can.Model.Mixin('contactable', {
    // NB : Because the attributes object
    //  isn't automatically cloned into subclasses by CanJS (this is an intentional
    //  exception), when subclassing a class that uses this mixin, be sure to pull in the
    //  parent class's attributes using `can.extend(this.attributes, <parent_class>.attributes);`
    //  in the child class's static init function.
    'extend:attributes': {
      contact: 'CMS.Models.Person.stub',
      secondary_contact: 'CMS.Models.Person.stub',
    },
  }, {
    before_create: function () {
      let person = {
        id: GGRC.current_user.id,
        type: 'Person',
      };
      if (!this.contact) {
        this.attr('contact', person);
      }
    },
    form_preload: function (newObjectForm) {
      let person = {
        id: GGRC.current_user.id,
        type: 'Person',
      };
      if (newObjectForm && !this.contact) {
        this.attr('contact', person);
        this.attr('_transient.contact', person);
      } else if (this.contact) {
        this.attr('_transient.contact', this.contact);
      }
    },
  });

  can.Model.Mixin('accessControlList', {
    'after:init': function () {
      if (!this.access_control_list) {
        this.attr('access_control_list', []);
      }
    },
  });

  can.Model.Mixin('assertions_categories', {
    'before:refresh': function () {
      if (this.attr('categories') && !isSnapshot(this)) {
        this.attr('categories').replace([]);
      }

      if (this.attr('assertions') && !isSnapshot(this)) {
        this.attr('assertions').replace([]);
      }
    },
  });

  can.Model.Mixin('ca_update', {}, {
    after_save: function () {
      this.dispatch('readyForRender');
    },
    info_pane_preload: function () {
      this.refresh();
    },
  });

  can.Model.Mixin('inScopeObjectsPreload', {}, {
    'after:info_pane_preload': function () {
      if (this.updateScopeObject) {
        this.updateScopeObject();
      }
    },
  });

  can.Model.Mixin('inScopeObjects', {}, {
    updateScopeObject: function () {
      let objType = 'Audit';
      let queryType = 'values';
      let queryFields = ['id', 'type', 'title', 'context', 'issue_tracker'];
      let query =
        buildParam(objType, {
          current: 1,
          pageSize: 1,
        }, {
          type: this.attr('type'),
          operation: 'relevant',
          id: this.attr('id'),
        }, queryFields);
      return batchRequests(query)
        .done(function (valueArr) {
          let audit = valueArr[objType][queryType][0];

          this.attr('audit', audit);
        }.bind(this));
    },
  });

  function getAllowedMappings(allowed) {
    return _.union(
      GGRC.config.snapshotable_objects,
      ['Issue'],
      allowed || []
    );
  }

  can.Model.Mixin('mapping-limit', {
    getAllowedMappings: getAllowedMappings,
  }, {});

  can.Model.Mixin('mapping-limit-issue', {
    getAllowedMappings: _.partial(getAllowedMappings, ['Program', 'Project', 'TaskGroup']),
  }, {});

  can.Model.Mixin('issueTrackerIntegratable', {
    issue_tracker_enable_options: [
      {value: true, title: 'On'},
      {value: false, title: 'Off'},
    ],
    issue_tracker_priorities: ['P0', 'P1', 'P2', 'P3', 'P4'],
    issue_tracker_severities: ['S0', 'S1', 'S2', 'S3', 'S4'],
  }, {
    'after:init': function () {
      this.initIssueTracker();
    },

    initIssueTracker() {
      if (!this.issue_tracker) {
        this.issue_tracker = new can.Map({});
      }

      if (GGRC.ISSUE_TRACKER_ENABLED) {
        // check "title_singular" because "new instance"
        // doesn't have "type" property
        if (this.attr('type') === 'Audit' ||
          this.class.title_singular === 'Audit') {
          this.initAuditIssueTracker();
        } else {
          this.ensureParentAudit().then((audit) => {
            if (audit) {
              this.attr('audit', audit);
              this.initIssueTrackerForAssessment();
            }
          });
        }
      }
    },

    ensureParentAudit() {
      const pageInstance = GGRC.page_instance();
      const dfd = new can.Deferred();
      if (this.audit) {
        return dfd.resolve(this.audit);
      }

      if (this.isNew()) {
        if (pageInstance && pageInstance.type === 'Audit') {
          dfd.resolve(pageInstance);
        }
      } else {
        // audit is not page instane if AssessmentTemplate is edited
        // from Global Search results
        const param = buildParam('Audit', {}, {
          type: this.type,
          id: this.id,
        }, ['id', 'title', 'type', 'context', 'issue_tracker']);

        makeRequest({data: [param]}).then((response) => {
          this.audit = _.get(response, '[0].Audit.values[0]');
          dfd.resolve(this.audit);
        });
      }

      return dfd;
    },

    initAuditIssueTracker() {
      this.initIssueTrackerObject(
        new can.Map(AUDIT_ISSUE_TRACKER).attr({
          enabled: false, // turned OFF by default for AUDIT
        }), GGRC.ISSUE_TRACKER_ENABLED);
    },

    /**
     * Initializes Issue Tracker for Assessment and Assessment Template
     */
    initIssueTrackerForAssessment() {
      let auditItr = this.audit.issue_tracker || {};
      let itr = this.issue_tracker || {};
      let itrEnabled = this.isNew()
        // turned ON for Assessment & Assessment Template by default
        // for newly created instances
        ? (auditItr && auditItr.enabled)
        // for existing instance, the value from the server will be used
        : (itr && itr.enabled);

      let showIssureTrackerControls = this.isNew()
        // for new instance show controls if Issure Tracker enabled for Audit
        ? auditItr.enabled
        // for existing instance show controls if Issue Tracker enabled for
        // this instance or enabled for Audit
        : itr.enabled || auditItr.enabled;

      let issueTitle = this.title || '';

      this.initIssueTrackerObject(
        new can.Map(auditItr).attr({
          title: issueTitle,
          enabled: itrEnabled,
        }), showIssureTrackerControls);
    },
    /**
     * Initializes issue tracker data from predefined defaults if tracker
     * data is not available from server ( new/old instance with empty issue_tracker )
     * @param  {Object} [defaultValues={}] issue tracker properties
     * @param  {Boolean} [canUseIssueTracker=false] should IssueTracker controls be shown
     */
    initIssueTrackerObject: function (
      defaultValues = {},
      canUseIssueTracker = false
    ) {
      if (!GGRC.ISSUE_TRACKER_ENABLED) {
        return;
      }

      if ( !this.issueTrackerEnabled() ) {
        this.attr('issue_tracker', defaultValues);
      }
      this.attr('can_use_issue_tracker', canUseIssueTracker);
    },
    issueTrackerEnabled: function () {
      // 'issue_tracker' has already created if component_id is filled;
      return !!(this.issue_tracker && this.issue_tracker.component_id);
    },
    'before:refresh': function () {
      // clear warnings because CanJS save prev value of warning after merge
      // current instance and response
      if (this.issue_tracker && this.issue_tracker._warnings) {
        this.issue_tracker._warnings = [];
      }
    },
    'after:refresh': function (dfd) {
      // wait for a response from the server before initializing issue tracker controls
      if (dfd) {
        dfd.done(() => this.initIssueTracker());
      }
    },
  });

  /**
   * A mixin to use for objects that can have their status automatically
   * changed when they are edited.
   *
   * @class CMS.Models.Mixins.autoStatusChangeable
   */
  can.Model.Mixin('autoStatusChangeable', {}, {

    /**
     * Display a confirmation dialog before starting to edit the instance.
     *
     * The dialog is not shown if the instance is either in the "Not Started",
     * or the "In Progress" state - in that case an already resolved promise is
     * returned.
     *
     * @return {Promise} A promise resolved/rejected if the user chooses to
     *   confirm/reject the dialog.
     */
    confirmBeginEdit: function () {
      let STATUS_NOT_STARTED = 'Not Started';
      let STATUS_IN_PROGRESS = 'In Progress';
      let IGNORED_STATES = [STATUS_NOT_STARTED, STATUS_IN_PROGRESS];

      let TITLE = [
        'Confirm moving ', this.type, ' to "', STATUS_IN_PROGRESS, '"',
      ].join('');

      let DESCRIPTION = [
        'If you modify a value, the status of the ', this.type,
        ' will move from "', this.status, '" to "',
        STATUS_IN_PROGRESS, '" - are you sure about that?',
      ].join('');

      let confirmation = can.Deferred();

      if (_.includes(IGNORED_STATES, this.status)) {
        confirmation.resolve();
      } else {
        confirm({
          modal_description: DESCRIPTION,
          modal_title: TITLE,
          button_view: GGRC.mustache_path + '/gdrive/confirm_buttons.mustache',
        }, confirmation.resolve, confirmation.reject);
      }

      return confirmation.promise();
    },
  });

  can.Model.Mixin('unique_title', {
    'after:init': function () {
      this.validate(['title', '_transient.title'], function (newVal, prop) {
        if (prop === 'title') {
          return this.attr('_transient.title');
        } else if (prop === '_transient.title') {
          return newVal; // the title error is the error
        }
      });
    },
  }, {
    save_error: function (val) {
      if (/title values must be unique\.$/.test(val)) {
        this.attr('_transient.title', val);
      }
    },
    after_save: function () {
      this.removeAttr('_transient.title');
    },
    'before:attr': function (key, val) {
      if (key === 'title' &&
        arguments.length > 1 &&
        this._transient) {
        this.attr('_transient.title', null);
      }
    },
  });

  /**
   * A mixin to use for objects that can have a time limit imposed on them.
   *
   * @class CMS.Models.Mixins.timeboxed
   */
  can.Model.Mixin('timeboxed', {
    'extend:attributes': {
      start_date: 'date',
      end_date: 'date',
    },

    // Override default CanJS's conversion/serialization of dates, because
    // that takes the browser's local timezone into account, which we do not
    // want with our UTC dates. Having plain UTC-formatted date strings is
    // more suitable for the current structure of the app.
    serialize: {
      date: function (val, type) {
        return val;
      },
    },

    convert: {
      date: function (val, oldVal, fn, type) {
        return val;
      },
    },
  }, {});
  /**
   * Specific Model mixin to check overdue status
   */
  can.Model.Mixin('isOverdue', {
  }, {
    'after:init': function () {
      this.attr('isOverdue', this._isOverdue());
      this.bind('change', function () {
        this.attr('isOverdue', this._isOverdue());
      }.bind(this));
    },
    _isOverdue: function () {
      let doneState = this.attr('is_verification_needed') ?
        'Verified' : 'Finished';
      let endDate = moment(
        this.attr('next_due_date') || this.attr('end_date'));
      let today = moment().startOf('day');
      let startOfDate = moment(endDate).startOf('day');
      let isOverdue = endDate && today.diff(startOfDate, 'days') > 0;

      if (this.attr('status') === doneState) {
        return false;
      }
      return isOverdue;
    },
  });

  /**
   * A mixin to generate hash with refetch param.
   */
  can.Model.Mixin('refetchHash', {
    getHashFragment: function () {
      let widgetName = this.constructor.table_singular;
      if (window.location.hash
        .startsWith(['#', widgetName, '_widget'].join(''))) {
        return;
      }

      return [widgetName,
        '_widget/',
        this.hash_fragment(),
        '&refetch=true'].join('');
    },
  });

  can.Model.Mixin('proposable', {
    isProposable: true,
  }, {
    after_update() {
      this.dispatch({
        ...REFRESH_PROPOSAL_DIFF,
      });
    },
  });

  can.Model.Mixin('base-notifications', {
    send_by_default: true,
    recipients: 'Admin,Primary Contacts,Secondary Contacts',
  });

  can.Model.Mixin('relatedAssessmentsLoader', {}, {
    /**
     *
     * @param {Array} limit - Limit of loaded numbers
     * @param {Array} orderBy - Key: property name, Value: sorting direction (asc, desc)
     * @return {Promise}
     */
    getRelatedAssessments(limit = [0, 5], orderBy = []) {
      const type = this.attr('type');
      const instanceId = isSnapshot(this) ?
        this.snapshot.child_id :
        this.id;
      const params = {
        object_id: instanceId,
        object_type: type,
        limit: limit.join(','),
      };
      const orderAsString = orderBy
        .map((sort) => `${sort.field},${sort.direction}`)
        .join(',');

      if (orderAsString) {
        params.order_by = orderAsString;
      }
      return $.get('/api/related_assessments', params);
    },
  });
})(window.can, window.GGRC);
