/**
 * Internationalization support
 */

import * as vscode from 'vscode';

interface Messages {
    updateTo: string;
    upToDate: string;
    latest: string;
    updateAll: string;
    updated: string;
    packages: string;
    noUpdates: string;
    openRequirements: string;
    checkFailed: string;
    checking: string;
    updateAnyway: string;
    updateSafeOnly: string;
    updateAllRisky: string;
    majorFound: string;
}

const messages: Record<string, Messages> = {
    'en': {
        updateTo: 'Update to',
        upToDate: 'Up to date',
        latest: 'latest',
        updateAll: 'Update All Packages to Latest Versions',
        updated: 'Updated',
        packages: 'packages to latest versions',
        noUpdates: 'No packages to update',
        openRequirements: 'Please open a requirements.txt or pyproject.toml file',
        checkFailed: 'Check failed',
        checking: 'Checking',
        updateAnyway: 'Update Anyway',
        updateSafeOnly: 'Update Safe Only',
        updateAllRisky: 'Update All (Including Risky)',
        majorFound: 'Found {0} major version update(s) that may include breaking changes:'
    },
    'zh-cn': {
        updateTo: '更新到',
        upToDate: '已是最新',
        latest: '最新',
        updateAll: '更新所有包到最新版本',
        updated: '已更新',
        packages: '个包到最新版本',
        noUpdates: '没有需要更新的包',
        openRequirements: '请打开 requirements.txt 或 pyproject.toml 文件',
        checkFailed: '检查失败',
        checking: '检查中',
        updateAnyway: '仍然更新',
        updateSafeOnly: '仅更新安全版本',
        updateAllRisky: '全部更新 (包含风险)',
        majorFound: '发现 {0} 个重大版本更新，可能包含破坏性变更：'
    },
    'zh-tw': {
        updateTo: '更新到',
        upToDate: '已是最新',
        latest: '最新',
        updateAll: '更新所有套件到最新版本',
        updated: '已更新',
        packages: '個套件到最新版本',
        noUpdates: '沒有需要更新的套件',
        openRequirements: '請開啟 requirements.txt 或 pyproject.toml 檔案',
        checkFailed: '檢查失敗',
        checking: '檢查中',
        updateAnyway: '仍然更新',
        updateSafeOnly: '僅更新安全版本',
        updateAllRisky: '全部更新 (包含風險)',
        majorFound: '發現 {0} 個重大版本更新，可能包含破壞性變更：'
    },
    'ja': {
        updateTo: 'アップデート',
        upToDate: '最新です',
        latest: '最新',
        updateAll: 'すべてのパッケージを最新版に更新',
        updated: '更新しました',
        packages: 'パッケージを最新版に更新',
        noUpdates: '更新するパッケージはありません',
        openRequirements: 'requirements.txt または pyproject.toml ファイルを開いてください',
        checkFailed: 'チェック失敗',
        checking: 'チェック中',
        updateAnyway: 'とにかく更新',
        updateSafeOnly: '安全な更新のみ',
        updateAllRisky: 'すべて更新 (リスクあり)',
        majorFound: '{0} 個のメジャーアップデートが見つかりました。破壊的な変更が含まれている可能性があります：'
    },
    'ko': {
        updateTo: '업데이트',
        upToDate: '최신 버전',
        latest: '최신',
        updateAll: '모든 패키지를 최신 버전으로 업데이트',
        updated: '업데이트됨',
        packages: '패키지를 최신 버전으로 업데이트',
        noUpdates: '업데이트할 패키지가 없습니다',
        openRequirements: 'requirements.txt 또는 pyproject.toml 파일을 열어주세요',
        checkFailed: '확인 실패',
        checking: '확인 중',
        updateAnyway: '그래도 업데이트',
        updateSafeOnly: '안전한 업데이트만',
        updateAllRisky: '모두 업데이트 (위험 포함)',
        majorFound: '브레이킹 체인지가 포함될 수 있는 {0}개의 메이저 업데이트를 발견했습니다:'
    },
    'fr': {
        updateTo: 'Mettre à jour vers',
        upToDate: 'À jour',
        latest: 'dernière',
        updateAll: 'Mettre à jour tous les paquets vers les dernières versions',
        updated: 'Mis à jour',
        packages: 'paquets vers les dernières versions',
        noUpdates: 'Aucun paquet à mettre à jour',
        openRequirements: 'Veuillez ouvrir un fichier requirements.txt ou pyproject.toml',
        checkFailed: 'Échec de la vérification',
        checking: 'Vérification',
        updateAnyway: 'Mettre à jour quand même',
        updateSafeOnly: 'Uniquement les mises à jour sûres',
        updateAllRisky: 'Tout mettre à jour (y compris les risques)',
        majorFound: 'Trouvé {0} mise(s) à jour majeure(s) pouvant inclure des changements cassants :'
    },
    'de': {
        updateTo: 'Aktualisieren auf',
        upToDate: 'Aktuell',
        latest: 'neueste',
        updateAll: 'Alle Pakete auf neueste Versionen aktualisieren',
        updated: 'Aktualisiert',
        packages: 'Pakete auf neueste Versionen',
        noUpdates: 'Keine Pakete zu aktualisieren',
        openRequirements: 'Bitte öffnen Sie eine requirements.txt oder pyproject.toml Datei',
        checkFailed: 'Überprüfung fehlgeschlagen',
        checking: 'Überprüfen',
        updateAnyway: 'Trotzdem aktualisieren',
        updateSafeOnly: 'Nur sichere Updates',
        updateAllRisky: 'Alle aktualisieren (inklusive Risiko)',
        majorFound: '{0} Major-Updates gefunden, die bahnbrechende Änderungen enthalten können:'
    },
    'it': {
        updateTo: 'Aggiorna a',
        upToDate: 'Aggiornato',
        latest: 'ultima',
        updateAll: 'Aggiorna tutti i pacchetti alle ultime versioni',
        updated: 'Aggiornato',
        packages: 'pacchetti alle ultime versioni',
        noUpdates: 'Nessun pacchetto da aggiornare',
        openRequirements: 'Apri un file requirements.txt o pyproject.toml',
        checkFailed: 'Controllo fallito',
        checking: 'Controllo',
        updateAnyway: 'Aggiorna comunque',
        updateSafeOnly: 'Solo aggiornamenti sicuri',
        updateAllRisky: 'Aggiorna tutto (inclusi rischi)',
        majorFound: 'Trovati {0} aggiornamenti principali che potrebbero includere modifiche distruttive:'
    },
    'es': {
        updateTo: 'Actualizar a',
        upToDate: 'Actualizado',
        latest: 'última',
        updateAll: 'Actualizar todos los paquetes a las últimas versiones',
        updated: 'Actualizado',
        packages: 'paquetes a las últimas versiones',
        noUpdates: 'No hay paquetes para actualizar',
        openRequirements: 'Por favor abra un archivo requirements.txt o pyproject.toml',
        checkFailed: 'Comprobación fallida',
        checking: 'Comprobando',
        updateAnyway: 'Actualizar de todos modos',
        updateSafeOnly: 'Solo actualizaciones seguras',
        updateAllRisky: 'Actualizar todo (incluyendo riesgos)',
        majorFound: 'Se encontraron {0} actualizaciones principales que pueden incluir cambios disruptivos:'
    },
    'ru': {
        updateTo: 'Обновить до',
        upToDate: 'Актуально',
        latest: 'последняя',
        updateAll: 'Обновить все пакеты до последних версий',
        updated: 'Обновлено',
        packages: 'пакетов до последних версий',
        noUpdates: 'Нет пакетов для обновления',
        openRequirements: 'Пожалуйста, откройте файл requirements.txt или pyproject.toml',
        checkFailed: 'Ошибка проверки',
        checking: 'Проверка',
        updateAnyway: 'Обновить в любом случае',
        updateSafeOnly: 'Только безопасные обновления',
        updateAllRisky: 'Обновить все (включая рискованные)',
        majorFound: 'Найдено {0} мажорных обновлений, которые могут содержать критические изменения:'
    }
};

export function getLocale(overrideLanguage?: string): string {
    let locale = overrideLanguage;

    if (!locale) {
        try {
            locale = vscode.env.language;
        } catch (e) {
            // vscode module might not be available in tests
            locale = 'en';
        }
    }

    locale = (locale || 'en').toLowerCase();

    // Handle specific locales
    if (messages[locale]) {
        return locale;
    }

    // Handle language families (e.g., zh-cn, zh-tw)
    const language = locale.split('-')[0];
    if (language === 'zh') {
        return locale.includes('tw') || locale.includes('hk') ? 'zh-tw' : 'zh-cn';
    }

    // Generic fallback to language family if available (e.g. fr-ca -> fr)
    if (messages[language]) {
        return language;
    }

    // Fallback to English
    return 'en';
}

export function t(key: keyof Messages, ...args: any[]): string {
    const locale = getLocale();
    let msg = messages[locale]?.[key] || messages['en'][key];
    if (args.length > 0) {
        args.forEach((arg, i) => {
            msg = msg.replace(`{${i}}`, String(arg));
        });
    }
    return msg;
}