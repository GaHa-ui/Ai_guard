package com.aiguard;

import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class Aiguard extends JavaPlugin implements Listener {

    private String apiUrl;
    private String apiKey;
    private boolean enabled = true;
    private int sensitivity = 50;
    private boolean testMode = false;

    private final Map<UUID, Long> lastMoveTime = new HashMap<>();
    private final Map<UUID, Integer> blocksBroken = new HashMap<>();
    private final Map<UUID, Long> blockBreakStart = new HashMap<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        
        apiUrl = getConfig().getString("api_url", "http://localhost:3000/api");
        apiKey = getConfig().getString("api_key", "your_mc_api_key_secret");
        enabled = getConfig().getBoolean("enabled", true);
        sensitivity = getConfig().getInt("sensitivity", 50);
        testMode = getConfig().getBoolean("test_mode", false);

        getServer().getPluginManager().registerEvents(this, this);
        
        getLogger().info("✅ AI Guard плагин включен!");
        getLogger().info("📡 API: " + apiUrl);
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        if (!enabled) return;
        sendWebhook("player_join", event.getPlayer().getName(), null);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        if (!enabled) return;
        sendWebhook("player_quit", event.getPlayer().getName(), null);
    }

    @EventHandler
    public void onMove(PlayerMoveEvent event) {
        if (!enabled) return;
        if (event.getFrom().getBlock().equals(event.getTo().getBlock())) return;

        UUID uuid = event.getPlayer().getUniqueId();
        long now = System.currentTimeMillis();
        
        if (lastMoveTime.containsKey(uuid)) {
            long diff = now - lastMoveTime.get(uuid);
            if (diff > 0) {
                double speed = 1000.0 / diff;
                
                // Проверка на полёт
                if (event.getPlayer().isFlying() || event.getTo().getY() > event.getFrom().getY() + 0.5) {
                    if (!event.getPlayer().hasPermission("essentials.fly")) {
                        sendCheck(event.getPlayer().getName(), "fly", 
                            event.getTo().getX() + "," + event.getTo().getY() + "," + event.getTo().getZ(),
                            speed, 0, 0);
                    }
                }
                
                // Неестественная скорость
                if (speed > 20 && !event.getPlayer().hasPermission("essentials.speed")) {
                    sendCheck(event.getPlayer().getName(), "speed_hack",
                        event.getTo().getX() + "," + event.getTo().getY() + "," + event.getTo().getZ(),
                        speed, 0, 0);
                }
            }
        }
        
        lastMoveTime.put(uuid, now);
    }

    @EventHandler
    public void onBlockBreak(BlockBreakEvent event) {
        if (!enabled) return;
        
        UUID uuid = event.getPlayer().getUniqueId();
        long now = System.currentTimeMillis();
        
        if (!blockBreakStart.containsKey(uuid)) {
            blockBreakStart.put(uuid, now);
            blocksBroken.put(uuid, 1);
        } else {
            long startTime = blockBreakStart.get(uuid);
            if (now - startTime > 1000) {
                // Сброс счётчика каждую секунду
                blockBreakStart.put(uuid, now);
                blocksBroken.put(uuid, 1);
            } else {
                int blocks = blocksBroken.getOrDefault(uuid, 0) + 1;
                blocksBroken.put(uuid, blocks);
                
                // Проверка скорости майнинга
                double breakRate = blocks * 1000.0 / (now - startTime);
                
                if (breakRate > 20) { //高于20块/秒 = 异常
                    sendCheck(event.getPlayer().getName(), "fast_mining",
                        event.getBlock().getLocation().getX() + "," + 
                        event.getBlock().getLocation().getY() + "," + 
                        event.getBlock().getLocation().getZ(),
                        0, breakRate, 0);
                }
            }
        }
    }

    @EventHandler
    public void onDamage(EntityDamageByEntityEvent event) {
        if (!enabled) return;
        if (!(event.getDamager() instanceof org.bukkit.entity.Player)) return;
        if (!(event.getEntity() instanceof org.bukkit.entity.Player)) return;
        
        org.bukkit.entity.Player attacker = (org.bukkit.entity.Player) event.getDamager();
        
        // Проверка на килл ауру - слишком быстрые атаки
        double damage = event.getDamage();
        if (damage > 10) {
            sendCheck(attacker.getName(), "possible_killaura",
                attacker.getLocation().getX() + "," + attacker.getLocation().getY() + "," + attacker.getLocation().getZ(),
                0, 0, 0);
        }
    }

    @EventHandler
    public void onCommand(PlayerCommandPreprocessEvent event) {
        if (!enabled) return;
        
        String command = event.getMessage().toLowerCase();
        
        // Проверка на подозрительные команды
        if (command.contains("/fly") || command.contains("/speed") || 
            command.contains("/god") || command.contains("/vanish")) {
            if (!event.getPlayer().hasPermission("aiguard.admin")) {
                sendCheck(event.getPlayer().getName(), "suspicious_command",
                    event.getPlayer().getLocation().getX() + "," + 
                    event.getPlayer().getLocation().getY() + "," + 
                    event.getPlayer().getLocation().getZ(),
                    0, 0, 0);
            }
        }
    }

    private void sendCheck(String playerName, String action, String position, 
                          double speed, double blockBreakRate, double distance) {
        new BukkitRunnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL(apiUrl + "/check");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setRequestProperty("X-API-Key", apiKey);
                    conn.setDoOutput(true);

                    String json = String.format(
                        "{\"playerName\":\"%s\",\"action\":\"%s\",\"position\":\"%s\"," +
                        "\"speed\":%.2f,\"blockBreakRate\":%.2f,\"distance\":%.2f," +
                        "\"timestamp\":\"%d\"}",
                        playerName, action, position, speed, blockBreakRate, distance,
                        System.currentTimeMillis()
                    );

                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(json.getBytes(StandardCharsets.UTF_8));
                    }

                    int response = conn.getResponseCode();
                    if (response == 200) {
                        if (testMode) {
                            getLogger().info("✅ Проверка отправлена: " + playerName + " - " + action);
                        }
                    } else {
                        getLogger().warning("❌ Ошибка API: " + response);
                    }
                } catch (Exception e) {
                    getLogger().warning("❌ Ошибка отправки: " + e.getMessage());
                }
            }
        }.runTaskAsynchronously(this);
    }

    private void sendWebhook(String event, String player, Map<String, Object> data) {
        if (testMode) return;
        
        new BukkitRunnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL(apiUrl + "/webhook");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setRequestProperty("X-API-Key", apiKey);
                    conn.setDoOutput(true);

                    String json = String.format(
                        "{\"event\":\"%s\",\"player\":\"%s\",\"data\":%s}",
                        event, player, data != null ? data.toString() : "{}"
                    );

                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(json.getBytes(StandardCharsets.UTF_8));
                    }
                    
                    conn.getResponseCode();
                } catch (Exception e) {
                    getLogger().warning("❌ Ошибка вебхука: " + e.getMessage());
                }
            }
        }.runTaskAsynchronously(this);
    }

    // Команда для бана через бота
    public void banPlayer(String playerName, String reason) {
        new BukkitRunnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL(apiUrl + "/ban");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setRequestProperty("X-API-Key", apiKey);
                    conn.setDoOutput(true);

                    String json = String.format(
                        "{\"playerName\":\"%s\",\"reason\":\"%s\",\"admin\":\"AI_System\"}",
                        playerName, reason
                    );

                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(json.getBytes(StandardCharsets.UTF_8));
                    }

                    if (conn.getResponseCode() == 200) {
                        getServer().dispatchCommand(getServer().getConsoleSender(), 
                            "ban " + playerName + " " + reason);
                        getLogger().info("🔨 Игрок забанен: " + playerName);
                    }
                } catch (Exception e) {
                    getLogger().warning("❌ Ошибка бана: " + e.getMessage());
                }
            }
        }.runTaskAsynchronously(this);
    }
}