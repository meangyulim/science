import { badWords, matchingItems, allQuizPool } from './data.js?v=4';

// 🚨 자가 진단 에러 출력 함수 먼저 등록
        window.showAlert = function(title, msg, type = 'success') {
            const modal = document.getElementById('customAlert');
            document.getElementById('alertTitle').innerText = title;
            document.getElementById('alertMsg').innerText = msg;
            const iconEl = document.getElementById('alertIcon');

            if (type === 'success') {
                iconEl.className = "w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xl flex items-center justify-center mx-auto mb-4";
                iconEl.innerHTML = `<i class="fa-regular fa-circle-check"></i>`;
            } else {
                iconEl.className = "w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xl flex items-center justify-center mx-auto mb-4";
                iconEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i>`;
            }
            modal.classList.remove('hidden');
        };

        window.closeAlert = function() {
            document.getElementById('customAlert').classList.add('hidden');
            playSynthSound(400, 'sine', 0.05);
        };

        import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
        import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
        import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

        // Globals provided by environment
        const appId = 'geological-era-sehwa';
        
        // 🚨 선생님의 실제 DB 강제 연결
        const firebaseConfig = {
            apiKey: "AIzaSyDyscbvZ4d9dCKHa4EcKEKEKFJJeJTPets",
            authDomain: "sehwa-f2f95.firebaseapp.com",
            projectId: "sehwa-f2f95",
            storageBucket: "sehwa-f2f95.firebasestorage.app",
            messagingSenderId: "538221310192",
            appId: "1:538221310192:web:c0c949065d362562cad235",
            measurementId: "G-XJW5TGB6RH"
        };

        // DB & Auth services
        let app, auth, db;
        let currentUser = null;
        let userNickname = "";
        let userAvatar = "🦕";
        
        // 두 개의 독립된 점수 관리
        let userHighScoreMatch = parseInt(localStorage.getItem('userHighScoreMatch') || '0');
        let userHighScoreQuiz = parseInt(localStorage.getItem('userHighScoreQuiz') || '0');
        
        // 리더보드 모드 상태 (match / quiz)
        let currentLeaderboardMode = 'match';
        let cachedLeaderboardData = [];

        // Initialize Firebase
        try {
            app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);
        } catch (e) {
            window.showAlert("파이어베이스 초기화 에러", `코드 내 키 값을 다시 확인해주세요.\n오류내용: ${e.message}`, "error");
        }

        // Auth Sequence
        const initAuth = async () => {
            if (!auth) return;
            try {
                await signInAnonymously(auth);
            } catch (error) {
                window.showAlert("파이어베이스 연결 실패", `파이어베이스 콘솔 -> Authentication -> Sign-in method 에서 [익명 로그인]을 켜주세요!\n\n오류: ${error.message}`, "error");
            }
        };

        if (auth) {
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    currentUser = user;
                    loadUserProfile();
                    setupLeaderboardListener();
                } else {
                    currentUser = null;
                }
            });
            initAuth();
        }

        // Public Collection: /artifacts/{appId}/public/data/leaderboard
        const getLeaderboardColRef = () => {
            return collection(db, 'artifacts', appId, 'public', 'data', 'leaderboard');
        };

        // 🌟 무작위 닉네임 생성 함수 
        function generateRandomNickname() {
            const prefixes = ["시조새", "삼엽충", "매머드", "방추충", "암모나이트", "갑주어", "필석", "고사리", "공룡", "남세균"];
            return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${Math.floor(1000 + Math.random() * 9000)}`;
        }

        // 🌟 앱 실행 시 닉네임 자동 세팅 (기존 유저는 이전 닉네임 불러옴)
        window.onload = function() {
            let savedName = localStorage.getItem('userNickname');
            if (!savedName) savedName = generateRandomNickname();
            
            document.getElementById('nicknameInput').value = savedName; // 입력창에 미리 적어두기

            let savedAvatar = localStorage.getItem('userAvatar') || '🦕';
            window.selectAvatar(savedAvatar, null, true); // 저장된 아바타도 복구
        };

        // --- LOBBY & USER PROFILE ---
        window.joinLobby = async function() {
            const nicknameVal = document.getElementById('nicknameInput').value.trim();
            if (!nicknameVal) {
                window.showAlert('닉네임 입력 필요', '친구나 경쟁자가 나를 구별할 수 있도록 멋진 닉네임을 설정해주세요!', 'error');
                return;
            }

            // 비속어 및 부적절한 단어 필터링 배열 (선생님이 주신 철벽 방어 목록 완벽 반영)
            // 띄어쓰기 꼼수 방지 및 영문 소문자 변환 검사
            const sanitizedInput = nicknameVal.replace(/\s/g, "").toLowerCase();
            const isBadWord = badWords.some(word => sanitizedInput.includes(word.toLowerCase()));

            if (isBadWord) {
                window.showAlert('부적절한 닉네임', '바르고 고운 말을 사용해주세요! (비속어 또는 부적절한 단어가 감지되었습니다)', 'error');
                return; // 로그인 중단
            }

            userNickname = nicknameVal;
            localStorage.setItem('userNickname', userNickname); // 🌟 로그인 성공 시 닉네임 영구 저장!
            
            // UI 전환
            document.getElementById('authSection').classList.add('hidden');
            document.getElementById('gameHub').classList.remove('hidden');
            document.getElementById('gameHub').classList.add('flex');
            document.getElementById('userHeaderBadge').classList.remove('hidden');
            document.getElementById('userNicknameBadge').innerText = userNickname;
            document.getElementById('userAvatarBadge').innerText = userAvatar;

            playSynthSound(220, 'triangle', 0.2); 
            setTimeout(() => playSynthSound(440, 'sine', 0.15), 100);

            if (currentUser) {
                await syncUserDataToFirestore();
            } else {
                setupMockLeaderboard();
            }
        };

        // 🌟 아바타 선택 시 로컬 스토리지에 저장하는 기능 추가
        window.selectAvatar = function(emoji, label, isAutoInit = false) {
            userAvatar = emoji;
            localStorage.setItem('userAvatar', userAvatar);

            const buttons = document.querySelectorAll('.avatar-btn');
            buttons.forEach(btn => {
                btn.classList.remove('border-emerald-500', 'bg-emerald-500/10');
                btn.classList.add('border-emerald-500/20');
                // 해당 이모지를 가진 버튼 찾아서 활성화 스타일 적용
                if (btn.innerText.includes(emoji)) {
                    btn.classList.remove('border-emerald-500/20');
                    btn.classList.add('border-emerald-500', 'bg-emerald-500/10');
                }
            });
            
            if(!isAutoInit) playSynthSound(330, 'sine', 0.1);
        };

        async function loadUserProfile() {
            if (!currentUser) return;
            try {
                // 🚨 수정사항: Firestore 문서는 반드시 짝수 단계(폴더->문서->폴더->문서)를 가져야 합니다.
                // 기존 코드는 'profile' 폴더(5단계)에서 끝나서 에러가 났으므로 마지막에 'data' 문서 이름(6단계)을 붙여주었습니다.
                const profileDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'data');
                const docSnap = await getDoc(profileDocRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.matchScore) userHighScoreMatch = data.matchScore;
                    if (data.quizScore) userHighScoreQuiz = data.quizScore;
                }
            } catch (err) {
                console.warn("프로필 로드 에러:", err);
            }
        }

        async function syncUserDataToFirestore() {
            if (!currentUser) return;
            try {
                // Private Profile Sync (6단계 경로로 수정완료)
                const profileDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'data');
                await setDoc(profileDocRef, {
                    nickname: userNickname,
                    avatar: userAvatar,
                    matchScore: userHighScoreMatch,
                    quizScore: userHighScoreQuiz,
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                // Public Leaderboard Registry
                const scoreDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', currentUser.uid);
                await setDoc(scoreDocRef, {
                    uid: currentUser.uid,
                    nickname: userNickname,
                    avatar: userAvatar,
                    matchScore: userHighScoreMatch,
                    quizScore: userHighScoreQuiz,
                    timestamp: new Date().getTime()
                }, { merge: true });

            } catch (err) {
                window.showAlert("데이터 저장 실패", `상세: ${err.message}`, "error");
            }
        }

        // --- LEADERBOARD LOGIC ---
        function setupLeaderboardListener() {
            if (!currentUser) return;
            try {
                const leaderboardCol = getLeaderboardColRef();
                onSnapshot(leaderboardCol, (snapshot) => {
                    const boardData = [];
                    snapshot.forEach(docSnap => boardData.push(docSnap.data()));
                    cachedLeaderboardData = boardData;
                    renderLeaderboard();
                }, (error) => {
                    window.showAlert("리더보드 로드 에러", `상세: ${error.message}`, "error");
                });
            } catch (e) {
                console.error("Listener init fail:", e);
            }
        }

        // 파이어베이스 오프라인 시 임시 목업
        function setupMockLeaderboard() {
            cachedLeaderboardData = [
                { uid: 'bot1', avatar: '🦕', nickname: '지학1등급', matchScore: 120, quizScore: 110 },
                { uid: 'bot2', avatar: '🪲', nickname: '세화여고짱', matchScore: 90, quizScore: 85 },
                { uid: 'bot3', avatar: '🐚', nickname: '암모나이트러버', matchScore: 70, quizScore: 60 },
                { uid: 'local', avatar: userAvatar, nickname: userNickname, matchScore: userHighScoreMatch, quizScore: userHighScoreQuiz }
            ];
            renderLeaderboard();
        }

        window.setLeaderboardMode = function(mode) {
            currentLeaderboardMode = mode;
            
            const btnMatch = document.getElementById('lbTab-match');
            const btnQuiz = document.getElementById('lbTab-quiz');

            if (mode === 'match') {
                btnMatch.className = "flex-1 py-1.5 text-[10px] font-bold rounded-md bg-purple-500/20 text-purple-300 transition";
                btnQuiz.className = "flex-1 py-1.5 text-[10px] font-bold rounded-md text-gray-500 hover:text-gray-300 transition";
            } else {
                btnQuiz.className = "flex-1 py-1.5 text-[10px] font-bold rounded-md bg-blue-500/20 text-blue-300 transition";
                btnMatch.className = "flex-1 py-1.5 text-[10px] font-bold rounded-md text-gray-500 hover:text-gray-300 transition";
            }
            
            playSynthSound(500, 'sine', 0.05);
            renderLeaderboard();
        };

        function renderLeaderboard() {
            const listContainer = document.getElementById('leaderboardList');
            
            let sortedData = [...cachedLeaderboardData].sort((a, b) => {
                let scoreA = currentLeaderboardMode === 'match' ? (a.matchScore || 0) : (a.quizScore || 0);
                let scoreB = currentLeaderboardMode === 'match' ? (b.matchScore || 0) : (b.quizScore || 0);
                return scoreB - scoreA;
            });

            sortedData = sortedData.filter(item => {
                let s = currentLeaderboardMode === 'match' ? (item.matchScore || 0) : (item.quizScore || 0);
                return s > 0;
            });

            if (sortedData.length === 0) {
                listContainer.innerHTML = `<div class="text-center py-8 text-xs text-gray-500">아직 해당 분야의 랭킹 기록이 없습니다.<br>첫 전당에 도전하세요!</div>`;
                return;
            }

            listContainer.innerHTML = sortedData.slice(0, 15).map((item, index) => {
                const isMe = (currentUser && item.uid === currentUser.uid) || (!currentUser && item.uid === 'local');
                let medal = `${index + 1}위`;
                if (index === 0) medal = '🥇';
                else if (index === 1) medal = '🥈';
                else if (index === 2) medal = '🥉';

                let displayScore = currentLeaderboardMode === 'match' ? (item.matchScore || 0) : (item.quizScore || 0);
                let colorClass = currentLeaderboardMode === 'match' ? 'text-purple-300' : 'text-blue-300';
                if (isMe) colorClass = 'text-emerald-400';

                return `
                    <div class="flex items-center justify-between p-2.5 rounded-xl border ${isMe ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-800/40 bg-gray-950/20'} text-xs">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-[10px] w-6 text-center text-gray-400 font-bold">${medal}</span>
                            <span class="text-base">${item.avatar || '🦕'}</span>
                            <span class="font-bold truncate max-w-[100px] text-gray-200">${item.nickname}</span>
                        </div>
                        <span class="font-mono font-bold ${colorClass}">${displayScore}점</span>
                    </div>
                `;
            }).join('');
        }

        async function updateLeaderboardScore(gameType, newScore) {
            let isUpdated = false;
            if (gameType === 'match' && newScore > userHighScoreMatch) {
                userHighScoreMatch = newScore;
                localStorage.setItem('userHighScoreMatch', userHighScoreMatch);
                isUpdated = true;
            } else if (gameType === 'quiz' && newScore > userHighScoreQuiz) {
                userHighScoreQuiz = newScore;
                localStorage.setItem('userHighScoreQuiz', userHighScoreQuiz);
                isUpdated = true;
            }

            if (isUpdated) {
                if (currentUser) {
                    await syncUserDataToFirestore();
                } else {
                    const idx = cachedLeaderboardData.findIndex(u => u.uid === 'local');
                    if(idx > -1) {
                        cachedLeaderboardData[idx].matchScore = userHighScoreMatch;
                        cachedLeaderboardData[idx].quizScore = userHighScoreQuiz;
                    }
                    renderLeaderboard();
                }
            }
        }

        // --- AUDIO ENGINE ---
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        function playSynthSound(frequency, type = 'sine', duration = 0.15) {
            try {
                if (audioCtx.state === 'suspended') audioCtx.resume();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                
                osc.type = type;
                osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
                
                gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
                
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + duration);
            } catch (err) {}
        }

        // --- TAB NAVIGATION ---
        window.switchTab = function(tabId) {
            const tabs = ['matchGame', 'quizSurvival'];
            tabs.forEach(t => {
                document.getElementById(`content-${t}`).classList.add('hidden');
                const tabBtn = document.getElementById(`tab-${t}`);
                tabBtn.className = "w-full text-left p-3.5 rounded-xl border border-gray-800 hover:border-gray-700 hover:bg-gray-800/40 text-gray-300 flex items-center gap-3 transition";
            });

            document.getElementById(`content-${tabId}`).classList.remove('hidden');
            const activeBtn = document.getElementById(`tab-${tabId}`);
            
            if (tabId === 'matchGame') {
                activeBtn.className = "w-full text-left p-3.5 rounded-xl border border-purple-500 bg-purple-500/10 text-purple-400 flex items-center gap-3 transition";
                playSynthSound(520, 'sine', 0.1);
                window.setLeaderboardMode('match');
            } else if (tabId === 'quizSurvival') {
                activeBtn.className = "w-full text-left p-3.5 rounded-xl border border-blue-500 bg-blue-500/10 text-blue-400 flex items-center gap-3 transition";
                playSynthSound(580, 'sine', 0.1);
                window.setLeaderboardMode('quiz');
            }
        };

        // --- 1. SPEED MATCHING GAME LOGIC (PDF 35개 전문) ---
        let matchGameTimer = null;
        let matchScore = 0;
        let matchRemainingTime = 45;
        let currentMatchDeck = [];
        let activeMatchItem = null;
        let isHellMode = false;
        let isInputLocked = false;

        window.startMatchGame = function() {
            document.getElementById('matchIntroArea').classList.add('hidden');
            document.getElementById('matchingActiveArea').classList.remove('hidden');
            
            // 하드모드 및 헬모드 토글 여부 확인
            const isHardMode = document.getElementById('hardModeToggle').checked;
            isHellMode = document.getElementById('hellModeToggle').checked;
            isInputLocked = false;

            // 모드에 따라 UI 버튼 변경 (하드모드 또는 헬모드일 때 기(Period) 단위 13개 버튼 노출)
            if (isHardMode || isHellMode) {
                document.getElementById('normalModeBtns').classList.add('hidden');
                document.getElementById('hardModeBtns').classList.remove('hidden');
                document.getElementById('hardModeBtns').classList.add('grid');
            } else {
                document.getElementById('hardModeBtns').classList.add('hidden');
                document.getElementById('hardModeBtns').classList.remove('grid');
                document.getElementById('normalModeBtns').classList.remove('hidden');
            }
            
            matchScore = 0;
            matchRemainingTime = isHellMode ? 30 : 45;
            document.getElementById('gameScore').innerText = matchScore;
            document.getElementById('gameTimer').innerText = matchRemainingTime;

            if (isHellMode) {
                // 헬모드: 개수 제한 없는 무제한 덱 구성
                currentMatchDeck = [...matchingItems].sort(() => Math.random() - 0.5);
                document.getElementById('remainingCards').innerText = "무제한";
            } else {
                // 일반/하드: 기존 15개 제한
                currentMatchDeck = [...matchingItems].sort(() => Math.random() - 0.5).slice(0, 15);
                document.getElementById('remainingCards').innerText = currentMatchDeck.length;
            }

            loadNextMatchItem();

            if (matchGameTimer) clearInterval(matchGameTimer);
            matchGameTimer = setInterval(() => {
                matchRemainingTime--;
                document.getElementById('gameTimer').innerText = matchRemainingTime;
                
                if (matchRemainingTime <= 5) {
                    document.getElementById('gameTimer').classList.add('text-red-500', 'animate-ping');
                    playSynthSound(700, 'sawtooth', 0.05);
                } else {
                    document.getElementById('gameTimer').classList.remove('text-red-500', 'animate-ping');
                }

                if (matchRemainingTime <= 0) endMatchGame();
            }, 1000);

            playSynthSound(500, 'square', 0.2);
        };

        function loadNextMatchItem() {
            if (currentMatchDeck.length === 0) {
                if (isHellMode) {
                    currentMatchDeck = [...matchingItems].sort(() => Math.random() - 0.5);
                } else {
                    endMatchGame();
                    return;
                }
            }

            activeMatchItem = currentMatchDeck.pop();
            document.getElementById('remainingCards').innerText = isHellMode ? "무제한" : (currentMatchDeck.length + 1);
            document.getElementById('currentCardName').innerText = activeMatchItem.name;
            document.getElementById('currentCardCategory').innerText = activeMatchItem.cat;
            document.getElementById('currentCardHint').innerText = activeMatchItem.hint;
        }

        window.selectMatchEra = function(clickedId) {
            if (!activeMatchItem || isInputLocked) return;

            const isHardMode = document.getElementById('hardModeToggle').checked;
            
            // 하드모드 또는 헬모드면 'period'(기)를, 노말 모드면 'era'(대)를 정답으로 체크
            const targetAnswer = (isHardMode || isHellMode) ? activeMatchItem.period : activeMatchItem.era;

            const isCorrect = Array.isArray(targetAnswer)
                ? targetAnswer.includes(clickedId)
                : targetAnswer === clickedId;

            if (isCorrect) {
                // 정답! (하드 모드 & 헬모드는 점수 2배: +20점)
                const earnedPoints = (isHardMode || isHellMode) ? 20 : 10;
                matchScore += earnedPoints;
                document.getElementById('gameScore').innerText = matchScore;
                
                const card = document.getElementById('currentMatchCard');
                card.classList.add('border-green-500');
                playSynthSound(880, 'sine', 0.1);
                setTimeout(() => card.classList.remove('border-green-500'), 150);

            } else {
                // 오답! (하드 모드 & 헬모드는 감점도 2배: -10점)
                const lostPoints = (isHardMode || isHellMode) ? 10 : 5;
                matchScore = Math.max(0, matchScore - lostPoints);
                document.getElementById('gameScore').innerText = matchScore;
                
                if (isHellMode) {
                    // 헬모드 페널티: 시간 3초 차감 및 0.3초 입력 스턴
                    matchRemainingTime = Math.max(0, matchRemainingTime - 3);
                    document.getElementById('gameTimer').innerText = matchRemainingTime;
                    
                    const card = document.getElementById('currentMatchCard');
                    card.classList.add('border-red-500', 'bg-red-500/20');
                    playSynthSound(100, 'sawtooth', 0.3);
                    
                    isInputLocked = true;
                    
                    if (matchRemainingTime <= 0) {
                        setTimeout(() => {
                            card.classList.remove('border-red-500', 'bg-red-500/20');
                            isInputLocked = false;
                            endMatchGame();
                        }, 300);
                        return;
                    }
                    
                    setTimeout(() => {
                        card.classList.remove('border-red-500', 'bg-red-500/20');
                        isInputLocked = false;
                        loadNextMatchItem();
                    }, 300);
                    return; // 0.3초 스턴 후 복구 시점에 리로드
                } else {
                    const card = document.getElementById('currentMatchCard');
                    card.classList.add('border-red-500');
                    playSynthSound(150, 'sawtooth', 0.2);
                    setTimeout(() => card.classList.remove('border-red-500'), 150);
                }
            }

            loadNextMatchItem();
        };

        function endMatchGame() {
            clearInterval(matchGameTimer);
            document.getElementById('gameTimer').classList.remove('text-red-500', 'animate-ping');
            document.getElementById('matchingActiveArea').classList.add('hidden');
            document.getElementById('matchIntroArea').classList.remove('hidden');
            
            updateLeaderboardScore('match', matchScore);

            playSynthSound(440, 'triangle', 0.15);
            setTimeout(() => playSynthSound(554, 'triangle', 0.15), 150);
            setTimeout(() => playSynthSound(659, 'triangle', 0.15), 300);
            setTimeout(() => playSynthSound(880, 'triangle', 0.4), 450);

            window.showAlert('스피드 챌린지 종료', `획득 점수: ${matchScore}점! 독립된 매칭 랭킹에 기록되었습니다.`, 'success');
        }


        // --- 2. MCQ SURVIVAL QUIZ LOGIC ---
        let quizList = [];
        let quizIndex = 0;
        let cumulativeQuizScore = 0;
        let quizTimerInterval = null;
        let bonusTimeSeconds = 15;

        window.startQuiz = function() {
            document.getElementById('quizIntroArea').classList.add('hidden');
            document.getElementById('quizPlayingArea').classList.remove('hidden');
            document.getElementById('quizFeedbackArea').classList.add('hidden');

            quizList = [...allQuizPool].sort(() => Math.random() - 0.5).slice(0, 10);

            quizIndex = 0;
            cumulativeQuizScore = 0;
            
            showQuestion();
            playSynthSound(440, 'triangle', 0.1);
        };

        function showQuestion() {
            if (quizIndex >= quizList.length) {
                finishQuizGame();
                return;
            }

            document.getElementById('quizFeedbackArea').classList.add('hidden');
            document.getElementById('quizPlayingArea').classList.remove('hidden');

            const item = quizList[quizIndex];
            
            document.getElementById('currentQuizIdx').innerText = quizIndex + 1;
            document.getElementById('quizScoreUI').innerText = cumulativeQuizScore;
            document.getElementById('quizQuestionCategory').innerText = item.cat;
            document.getElementById('quizQuestionText').innerText = item.q;

            const optionsContainer = document.getElementById('quizOptionsContainer');
            optionsContainer.innerHTML = item.options.map((option, idx) => `
                <button onclick="window.submitQuizAnswer(${idx})" class="w-full text-left p-4 bg-gray-950 border border-gray-800 hover:border-blue-500 hover:bg-blue-950/10 rounded-xl font-medium text-xs text-gray-200 transition active:scale-95 flex items-center justify-between">
                    <span class="break-keep">${idx + 1}. ${option}</span>
                    <i class="fa-solid fa-chevron-right text-[10px] text-gray-500"></i>
                </button>
            `).join('');

            const percent = ((quizIndex + 1) / quizList.length) * 100;
            document.getElementById('quizProgressBar').style.width = `${percent}%`;

            bonusTimeSeconds = 15;
            document.getElementById('quizTimer').innerText = bonusTimeSeconds;
            
            if (quizTimerInterval) clearInterval(quizTimerInterval);
            quizTimerInterval = setInterval(() => {
                bonusTimeSeconds--;
                if (bonusTimeSeconds <= 0) {
                    bonusTimeSeconds = 0;
                    clearInterval(quizTimerInterval);
                }
                document.getElementById('quizTimer').innerText = bonusTimeSeconds;
            }, 1000);
        }

        window.submitQuizAnswer = function(selectedIdx) {
            clearInterval(quizTimerInterval);
            const item = quizList[quizIndex];
            const feedbackPanel = document.getElementById('quizFeedbackArea');
            const playingArea = document.getElementById('quizPlayingArea');

            playingArea.classList.add('hidden');
            feedbackPanel.classList.remove('hidden');

            const badge = document.getElementById('quizResultBadge');
            const title = document.getElementById('quizFeedbackTitle');
            const exp = document.getElementById('quizExplanationText');

            if (selectedIdx === item.answer) {
                const pointGain = 10 + bonusTimeSeconds; 
                cumulativeQuizScore += pointGain;

                badge.className = "w-10 h-10 rounded-full flex items-center justify-center text-lg font-extrabold bg-green-500/20 text-green-400 border border-green-500/30";
                badge.innerText = "O";
                title.innerText = `정답입니다! (+${pointGain}점 획득)`;
                title.className = "font-bold text-sm text-green-400";
                
                playSynthSound(950, 'sine', 0.25);
            } else {
                badge.className = "w-10 h-10 rounded-full flex items-center justify-center text-lg font-extrabold bg-red-500/20 text-red-400 border border-red-500/30";
                badge.innerText = "X";
                title.innerText = `아쉽게도 오답입니다... (정답은 ${item.answer + 1}번)`;
                title.className = "font-bold text-sm text-red-400";
                
                playSynthSound(130, 'square', 0.3);
            }
            exp.innerText = item.exp;
        };

        window.nextQuiz = function() {
            quizIndex++;
            showQuestion();
        };

        function finishQuizGame() {
            document.getElementById('quizPlayingArea').classList.add('hidden');
            document.getElementById('quizFeedbackArea').classList.add('hidden');
            document.getElementById('quizIntroArea').classList.remove('hidden');

            updateLeaderboardScore('quiz', cumulativeQuizScore);

            playSynthSound(600, 'sine', 0.15);
            setTimeout(() => playSynthSound(800, 'sine', 0.3), 150);

            window.showAlert('서바이벌 퀴즈 클리어!', `최종 점수: ${cumulativeQuizScore}점! 독립된 퀴즈 랭킹에 기록되었습니다.`, 'success');
        }