"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENABLE_ASSET_UPLOAD = exports.DEBUG_MODE = exports.WAITLIST_MODE = exports.SHOW_WHITEBOARDS = exports.APPLY_CODE_IMMEDIATELY = exports.SubscriptionStatuses = exports.CreditLimits = exports.ProductKeys = exports.NavigationTabNames = void 0;
var NavigationTabNames;
(function (NavigationTabNames) {
    NavigationTabNames["DASHBOARD"] = "Dashboard";
    NavigationTabNames["SETTINGS"] = "Settings";
})(NavigationTabNames || (exports.NavigationTabNames = NavigationTabNames = {}));
exports.ProductKeys = Object.freeze({
    FREE_SUBSCRIPTION: "free",
    PLUS_SUBSCRIPTION: "plus",
    PRO_SUBSCRIPTION: "pro",
    MAX_SUBSCRIPTION: "max",
    TEAM_SUBSCRIPTION: "team",
});
/**
 * Credit limits per subscription plan (per billing period)
 * Credits reset at the start of each billing period and do not roll over
 */
exports.CreditLimits = Object.freeze({
    FREE: 15,
    PLUS: 50,
    PRO: 100,
    MAX: 500,
    TEAM: 100,
});
exports.SubscriptionStatuses = Object.freeze({
    ACTIVE: "active",
    PAST_DUE: "past_due",
    CANCELED: "canceled",
});
// FLAGS
exports.APPLY_CODE_IMMEDIATELY = true;
exports.SHOW_WHITEBOARDS = false;
exports.WAITLIST_MODE = false;
exports.DEBUG_MODE = false;
exports.ENABLE_ASSET_UPLOAD = true;
