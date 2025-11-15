require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits,
  AuditLogEvent,
  Partials,
  EmbedBuilder
} = require("discord.js");
const config = require("./config.json");

const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials:[Partials.GuildMember]
});

// هل هو المالك؟
function isOwner(userId){
  return config.ownerIds.includes(userId);
}

// تصفير جميع رتب المخالف
async function resetMemberRoles(guild, userId){
  const member = guild.members.cache.get(userId);
  if (!member) return;

  try {
    const rolesToRemove = member.roles.cache.filter(r => r.id !== guild.id);
    for (const [id, role] of rolesToRemove) {
      await member.roles.remove(role.id, "Protection: Illegal role edit");
    }
  } catch (err) {
    console.error("خطأ أثناء التصفير:", err);
  }
}

// إرسال لوق
async function log(guild, msg){
  try {
    const ch = await guild.channels.fetch(config.logChannelId).catch(() => null);
    if (!ch) return;
    const embed = new EmbedBuilder()
      .setTitle("🛡️ حماية الرتب المتقدمة")
      .setDescription(msg)
      .setColor("Red")
      .setTimestamp();
    ch.send({ embeds: [embed] });
  } catch (err) {
    console.error("Log error:", err);
  }
}

client.once("ready", () => {
  console.log("🛡️ Role Protection Active:", client.user.tag);
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const guild = newMember.guild;

  // الرتب القديمة والجديدة
  const oldRoles = [...oldMember.roles.cache.keys()];
  const newRoles = [...newMember.roles.cache.keys()];

  // رتب تم إزالتها
  const removedRoles = oldRoles.filter(r => !newRoles.includes(r));

  if (removedRoles.length === 0) return;

  // الرتب المحمية التي تمت إزالتها
  const affectedProtectedRoles = removedRoles.filter(r => config.protectedRoleIds.includes(r));
  if (affectedProtectedRoles.length === 0) return;

  // آخر تعديل من السجلات
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 1 });
  const entry = logs.entries.first();
  if (!entry) return;

  const executor = entry.executor;
  const executorId = executor.id;
  const targetId   = entry.target.id;

  // إذا اللي عدل هو المالك → لا يعمل شيء
  if (isOwner(executorId)) return;

  // إرجاع الرتبة للشخص الذي تم إزالة رتبته
  for (const roleId of affectedProtectedRoles) {
    try {
      await newMember.roles.add(roleId, "Protection: Restoring protected role");
    } catch (err) {
      console.error("خطأ عند إرجاع الرتبة:", err);
    }
  }

  // تصفير المخالف
  await resetMemberRoles(guild, executorId);

  await log(
    guild,
    `⚠️ <@${executorId}> حاول إزالة رتبة محمية!\n` +
    `✔️ تمت إعادة الرتبة لـ <@${targetId}>\n` +
    `❌ وتم تصفير جميع رتب المخالف.`
  );
});

client.login(process.env.TOKEN);
