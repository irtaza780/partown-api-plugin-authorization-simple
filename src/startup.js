import ensureRoles from "./util/ensureRoles.js";
import {
  defaultAccountsManagerRoles,
  defaultShopManagerRoles,
  defaultShopOwnerRoles,
  defaultSystemManagerRoles,
} from "./util/defaultRoles.js";

const shopGroups = {
  "shop manager": defaultShopManagerRoles,
  owner: defaultShopOwnerRoles,
};

/**
 * @summary Called on startup
 * @param {Object} context Startup context
 * @param {Object} context.collections Map of MongoDB collections
 * @returns {undefined}
 */
export default async function simpleAuthStartup(context) {
  console.log("0 - registering auth startup function");
  const {
    appEvents,
    collections: { Groups },
  } = context;

  // Add missing roles to `roles` collection if needed
  console.log("1 - ensuring roles");
  await ensureRoles(context, defaultAccountsManagerRoles);
  await ensureRoles(context, defaultShopManagerRoles);
  await ensureRoles(context, defaultShopOwnerRoles);
  await ensureRoles(context, defaultSystemManagerRoles);
  console.log("1.5 - roles ensured");

  // There are two global roles that the accounts plugin creates by default
  // when the first account is created, if they don't exist. We want to
  // immediately set the permissions array to the default list of permissions
  // for both of these.
  //
  // Also, when a shop group is created, we set the default permissions for it,
  // or an empty array for custom groups.
  console.log("2 - registering app even after account create");
  appEvents.on("afterAccountGroupCreate", async ({ group }) => {
    // If permissions were supplied when creating, do not overwrite them here
    if (Array.isArray(group.permissions) && group.permissions.length > 0) {
      console.log("3 - checking existing permissions existing?");
      return;
    }

    let permissions = [];

    console.log("4 - checking existing account roles");

    if (group.slug === "accounts-manager") {
      console.log("5  - account manager role");
      permissions = defaultAccountsManagerRoles;
    } else if (group.slug === "system-manager") {
      console.log("6 - system manager role");
      permissions = defaultSystemManagerRoles;
    } else if (group.shopId && group.slug && shopGroups[group.slug]) {
      // get roles from the default groups of the primary shop; we try to use this first before using default roles

      console.log("7 - getting roles from shop");
      const primaryShopId = await context.queries.primaryShopId(
        context.getInternalContext()
      );
      const primaryShopGroup = primaryShopId
        ? await Groups.findOne({ shopId: primaryShopId, slug: group.slug })
        : null;
      permissions =
        (primaryShopGroup && primaryShopGroup.permissions) ||
        shopGroups[group.slug];
    }

    console.log("8 - updating account group");
    await context.mutations.updateAccountGroup(context.getInternalContext(), {
      group: { permissions },
      groupId: group._id,
      shopId: group.shopId,
    });
  });

  // Whenever permissions array changes on any group, ensure that they all exist in
  // the `roles` collection so that the `roles` GQL query will include them.

  console.log("9 - triggering after account group update");
  appEvents.on("afterAccountGroupUpdate", async ({ group, updatedFields }) => {
    if (!Array.isArray(updatedFields) || !updatedFields.includes("permissions"))
      return;
    await ensureRoles(context, group.permissions);
  });

  console.log("10 - function ended");
}
