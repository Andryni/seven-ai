import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FONT } from '../theme/typography';
import {
  Mail,
  HardDrive,
  Calendar,
  Camera,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Key,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native';

interface ConnectorCardProps {
  type: 'google' | 'instagram' | 'api_keys';
  title: string;
  subtitle: string;
  connected: boolean;
  details?: {
    email?: string;
    username?: string;
    unreadEmails?: number;
    upcomingEvents?: number;
    driveFiles?: number;
    unreadDms?: number;
    geminiKeySet?: boolean;
    openRouterKeySet?: boolean;
  };
  onConnect?: () => void;
  onSync?: () => void;
  onViewDetails?: () => void;
}

export const ConnectorCard: React.FC<ConnectorCardProps> = ({
  type,
  title,
  subtitle,
  connected,
  details,
  onConnect,
  onSync,
  onViewDetails,
}) => {
  return (
    <View style={styles.cardContainer}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.iconAndTitle}>
          <View
            style={[
              styles.iconWrapper,
              type === 'google'
                ? styles.googleIconWrap
                : type === 'instagram'
                ? styles.instaIconWrap
                : styles.keyIconWrap,
            ]}
          >
            {type === 'google' && <Mail size={16} color="#FFD700" />}
            {type === 'instagram' && <Camera size={16} color="#FF3366" />}
            {type === 'api_keys' && <Key size={16} color="#00E5FF" />}
          </View>
          <View>
            <Text style={styles.titleText}>{title}</Text>
            <Text style={styles.subtitleText}>{subtitle}</Text>
          </View>
        </View>

        {/* Connection status badge */}
        <View style={[styles.statusPill, connected ? styles.statusActive : styles.statusInactive]}>
          {connected ? (
            <CheckCircle2 size={10} color="#00FFA3" />
          ) : (
            <AlertCircle size={10} color="#FFA500" />
          )}
          <Text style={[styles.statusPillText, { color: connected ? '#00FFA3' : '#FFA500' }]}>
            {connected ? 'CONNECTED' : 'STANDBY'}
          </Text>
        </View>
      </View>

      {/* Body / Stats */}
      {type === 'google' && (
        <View style={styles.metricsRow}>
          <View style={styles.metricBadge}>
            <Mail size={12} color="#00FFA3" />
            <Text style={styles.metricValue}>{details?.unreadEmails ?? 3}</Text>
            <Text style={styles.metricLabel}>Gmail</Text>
          </View>

          <View style={styles.metricBadge}>
            <Calendar size={12} color="#00E5FF" />
            <Text style={styles.metricValue}>{details?.upcomingEvents ?? 2}</Text>
            <Text style={styles.metricLabel}>Events</Text>
          </View>

          <View style={styles.metricBadge}>
            <HardDrive size={12} color="#FFD700" />
            <Text style={styles.metricValue}>{details?.driveFiles ?? 14}</Text>
            <Text style={styles.metricLabel}>Drive Docs</Text>
          </View>
        </View>
      )}

      {type === 'instagram' && (
        <View style={styles.metricsRow}>
          <View style={styles.metricBadge}>
            <Camera size={12} color="#FF3366" />
            <Text style={styles.metricValue}>{details?.unreadDms ?? 2}</Text>
            <Text style={styles.metricLabel}>Unread DMs</Text>
          </View>

          <View style={[styles.metricBadge, { flex: 2 }]}>
            <ShieldCheck size={12} color="#00FFA3" />
            <Text style={styles.metricLabel}>
              {connected ? `Session: @${details?.username || 'user'}` : 'Web Session Mode'}
            </Text>
          </View>
        </View>
      )}

      {type === 'api_keys' && (
        <View style={styles.metricsRow}>
          <View style={styles.metricBadge}>
            <Key size={12} color={details?.geminiKeySet ? '#00FFA3' : '#FF3366'} />
            <Text style={styles.metricLabel}>
              Gemini: {details?.geminiKeySet ? 'SECURE' : 'MOCK/FREE'}
            </Text>
          </View>
          <View style={styles.metricBadge}>
            <Key size={12} color={details?.openRouterKeySet ? '#00FFA3' : '#FFA500'} />
            <Text style={styles.metricLabel}>
              OpenRouter: {details?.openRouterKeySet ? 'ACTIVE' : 'OPTIONAL'}
            </Text>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.cardActions}>
        {!connected ? (
          <TouchableOpacity style={styles.primaryActionBtn} onPress={onConnect}>
            <ExternalLink size={12} color="#050508" />
            <Text style={styles.primaryActionText}>
              {type === 'google'
                ? 'Connect Google Workspace (OAuth2)'
                : type === 'instagram'
                ? 'Connect via Browser (Recommended)'
                : 'Configure API Keys'}
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.syncBtn} onPress={onSync}>
              <RefreshCw size={11} color="#FFD700" />
              <Text style={styles.syncBtnText}>Sync Live</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.detailsBtn} onPress={onViewDetails}>
              <Text style={styles.detailsBtnText}>View Synced Data</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    padding: 12,
    marginVertical: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconAndTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIconWrap: {
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.4)',
  },
  instaIconWrap: {
    backgroundColor: 'rgba(255, 51, 102, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 51, 102, 0.4)',
  },
  keyIconWrap: {
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.4)',
  },
  titleText: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitleText: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 9.5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  statusActive: {
    backgroundColor: 'rgba(0, 255, 163, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 163, 0.4)',
  },
  statusInactive: {
    backgroundColor: 'rgba(255, 165, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.3)',
  },
  statusPillText: {
    fontFamily: FONT.mono,
    fontSize: 8.5,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  metricBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 5,
  },
  metricValue: {
    fontFamily: FONT.mono,
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  metricLabel: {
    fontFamily: FONT.mono,
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 9.5,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 4,
    gap: 6,
  },
  primaryActionText: {
    fontFamily: FONT.mono,
    color: '#050508',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderWidth: 1,
    borderColor: '#FFD700',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
    gap: 5,
  },
  syncBtnText: {
    fontFamily: FONT.mono,
    color: '#FFD700',
    fontSize: 9.5,
    fontWeight: '700',
  },
  detailsBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  detailsBtnText: {
    fontFamily: FONT.mono,
    color: '#FFF',
    fontSize: 9.5,
  },
});
