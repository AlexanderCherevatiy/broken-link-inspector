# Privacy policy

Applies to Broken Link Inspector 1.0.0.

## What the extension reads

When you start a page scan, the extension reads links, short link labels, the source page address and its title from the active tab's main document. It uses this information to identify links and show where they came from. Showing an original link scrolls and highlights the matching element when the tab and page element are still available.

If you choose **Scan bookmarks**, the browser asks for read access to bookmarks. The extension uses bookmark addresses to make the report and keeps the bookmark collection unchanged. The report does not store bookmark titles or folder names. Bookmark reports use a bookmarks source label because a bookmark has no originating page.

## What leaves your browser

A link check sends an HTTP request directly to that link's destination. The destination, along with any network intermediaries involved, can see information normally associated with the request. This can include the requested URL's path and query, IP address, browser headers, and connection timing. The site's own privacy practices determine what it logs. HTTP requests can be visible to intermediaries when the target uses unencrypted HTTP.

The extension requests only site access for the hosts involved in a check. It uses a HEAD request first. The extension may try a GET with a one-byte range after HTTP 405 or 501. Requests omit browser credentials and the referring page. The report can show the first redirect destination. The check does not automatically request it.

In Firefox, resolving hostnames uses the browser's DNS configuration. Your resolver can see the hostnames it resolves. Firefox uses built-in optional data consent for URLs found on web pages (`websiteContent`) and in bookmarks (`bookmarksInfo`). Required transmission is declared as none. A check of the applicable type waits for its optional consent and the relevant host grant.

The extension has no developer server, telemetry, advertising, or third-party analytics. It does not send reports, page labels, bookmark lists, CSV exports, or browsing history to its publisher. Its JavaScript ships inside the extension package.

## Local protection, storage, and deletion

The address filter skips explicit private addresses and local hostnames during normal checks. The local-test setting permits designated loopback addresses only when explicitly enabled and the site permission is granted. Edge checks the destination address space in the browser. In Firefox, the extension checks the browser's DNS answers before contacting a public-looking hostname and withholds the request if an answer is private or the host cannot be verified. DNS answers can change and proxies can change how connections are resolved or routed.

The extension omits fragments and credentials from links and redacts recognized sensitive URL components. A link identified as containing sensitive information is not checked. A source address stored with a report omits query parameters and fragments. Older report records are sanitized when migrating. The filter is heuristic, so ordinary paths, query names, and text may still contain identifying information. Use care with authenticated, private, or sensitive pages.

Report metadata, sanitized addresses and outcomes are stored in IndexedDB in your local browser profile. The extension normally retains the eight most recent reports and may temporarily keep older reports if they are being processed. Preferences are stored in local extension storage. Private or incognito sessions are excluded from report capture.

Use **Clear saved reports** in settings to remove locally stored reports. Browser extension settings let you revoke site access, bookmark access, and Firefox data consent. Uninstalling removes the extension's local browser data under the browser's normal rules. A CSV you download is a separate file controlled by you.

## Questions

Contact the publisher using the support channel linked from the distribution listing or the project's repository. Use a redacted URL or the test fixtures if you report an issue.

## Русская версия

Политика применяется к Broken Link Inspector 1.0.0.

### Какие данные читаются

При запуске проверки расширение читает ссылки, короткие подписи, адрес и заголовок основного документа текущей вкладки. Эти данные нужны для проверки и указания источника. Переход к ссылке прокручивает страницу и подсвечивает элемент, если вкладка и элемент ещё доступны.

При выборе проверки закладок браузер запрашивает доступ к ним на чтение. Для отчёта используются адреса закладок. Сами закладки не меняются, а их названия и имена папок не сохраняются в отчёте. Для ссылок из закладок отчёт показывает соответствующую метку источника.

### Какие данные выходят за пределы браузера

Проверка отправляет запрос по адресу самой ссылки. Сайт и сетевые посредники могут увидеть путь и параметры запроса, ваш IP-адрес, заголовки браузера и время подключения. Сайт обрабатывает эти сведения по собственным правилам. Незашифрованный HTTP-запрос может быть виден посредникам.

Расширение запрашивает доступ к хостам, участвующим в проверке. Сначала отправляется HEAD. После HTTP 405 или 501 возможен GET с запросом диапазона в один байт. Запросы не отправляют учётные данные браузера и адрес страницы-источника. Адрес перенаправления может быть указан в отчёте, но автоматически по нему запрос не отправляется.

В Firefox используется DNS-конфигурация браузера. Ваш DNS-резолвер может видеть запрашиваемые имена. Firefox также использует встроенное согласие на передачу адресов со страниц и из закладок. Обязательная передача не предусмотрена. Перед проверкой требуется согласие для соответствующего источника и доступ к нужному хосту.

У расширения нет сервера разработчика, телеметрии, рекламы и сторонней аналитики. Издателю не отправляются отчёты, подписи ссылок, списки закладок, CSV и история браузера. Весь выполняемый JavaScript входит в пакет расширения.

### Локальная защита, хранение и удаление

Обычная проверка исключает явные частные адреса и локальные имена. Настройка для локального стенда разрешает определённые loopback-адреса только после её включения и предоставления доступа. Edge контролирует адресное пространство назначения средствами браузера. Firefox сверяет DNS-ответы до запроса к хосту. Запрос пропускается, если найден частный адрес или имя не удалось проверить. DNS-ответ может измениться, а прокси может повлиять на определение и маршрутизацию адреса.

Расширение убирает из ссылок фрагменты и учётные данные, а также скрывает распознанные чувствительные компоненты URL. Ссылки, отмеченные как чувствительные, не проверяются. В адресе источника, сохранённом с отчётом, нет параметров и фрагмента. При переносе старых отчётов их записи очищаются. Фильтр использует эвристику. Идентифицирующие сведения всё ещё могут присутствовать в обычных адресах и тексте.

Метаданные отчёта, обработанные адреса и результаты сохраняются в IndexedDB в локальном профиле. Обычно остаются восемь последних отчётов. Более старые отчёты могут временно сохраниться, пока обрабатываются. Настройки хранятся локально. Отчёты из приватных сеансов и инкогнито не создаются.

Команда **«Очистить сохранённые отчёты»** удаляет локальные отчёты. Доступ к сайтам, закладкам и согласие Firefox можно отозвать в настройках браузера. При удалении расширения локальные данные удаляются по правилам браузера. Скачанный CSV остаётся отдельным файлом под вашим контролем.

По вопросам конфиденциальности обратитесь к издателю через канал поддержки из карточки расширения или репозитория. Для сообщения об ошибке используйте тестовые или очищенные адреса.
