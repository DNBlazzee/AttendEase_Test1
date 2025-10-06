// Firebase configuration - replace with your own config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// Elements
const loginForm = document.getElementById('loginForm');
const authMsg = document.getElementById('authMsg');
const userInfo = document.getElementById('userInfo');
const userEmailSpan = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');

const sessionCreationSection = document.getElementById('sessionCreation');
const sessionForm = document.getElementById('sessionForm');
const qrCodeDiv = document.getElementById('qrCode');

const studentForm = document.getElementById('studentForm');
const studentMsg = document.getElementById('studentMsg');

const adminPanel = document.getElementById('adminPanel');
const adminSessionSelect = document.getElementById('adminSessionSelect');
const attendanceListContainer = document.getElementById('attendanceListContainer');
const downloadCSVBtn = document.getElementById('downloadCSVBtn');

// Authentication state observer
auth.onAuthStateChanged(user => {
  if (user) {
    userEmailSpan.textContent = user.email;
    userInfo.style.display = 'block';
    loginForm.style.display = 'none';
    sessionCreationSection.style.display = 'block';
    adminPanel.style.display = 'block';
    loadSessionsToAdminSelect();
  } else {
    userInfo.style.display = 'none';
    loginForm.style.display = 'block';
    sessionCreationSection.style.display = 'none';
    adminPanel.style.display = 'none';
    qrCodeDiv.innerHTML = '';
    adminSessionSelect.innerHTML = '<option value="" disabled selected>-- Select Session --</option>';
    attendanceListContainer.innerHTML = '';
    downloadCSVBtn.style.display = 'none';
  }
});

// Login form submit
loginForm.addEventListener('submit', e => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      authMsg.textContent = '';
      loginForm.reset();
    })
    .catch(error => {
      authMsg.textContent = error.message;
      authMsg.className = 'error-msg';
    });
});

// Logout
logoutBtn.addEventListener('click', () => {
  auth.signOut();
});

// Create session
sessionForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('sessionName').value.trim();
  const date = document.getElementById('sessionDate').value;
  const time = document.getElementById('sessionTime').value;

  if (!name || !date || !time) return;

  const newSessionRef = db.ref('sessions').push();
  const sessionId = newSessionRef.key;

  const sessionData = {
    name, date, time,
    createdBy: auth.currentUser.uid,
    createdAt: firebase.database.ServerValue.TIMESTAMP
  };

  newSessionRef.set(sessionData)
    .then(() => {
      const qrData = JSON.stringify({ sessionId });
      qrCodeDiv.innerHTML = '<p><strong>Scan this QR code to mark attendance:</strong></p>';
      QRCode.toCanvas(qrData, { width: 200 }, (error, canvas) => {
        if (error) {
          qrCodeDiv.innerHTML += '<p class="error-msg">Error generating QR code.</p>';
          return;
        }
        qrCodeDiv.appendChild(canvas);
        qrCodeDiv.innerHTML += `<p class="small-text">Session ID encoded in QR: <code>${sessionId}</code></p>`;
      });
      sessionForm.reset();
      loadSessionsToAdminSelect();
    })
    .catch(err => {
      qrCodeDiv.innerHTML = `<p class="error-msg">Error creating session: ${err.message}</p>`;
    });
});

// Student attendance
studentForm.addEventListener('submit', e => {
  e.preventDefault();
  const studentName = document.getElementById('studentName').value.trim();
  const sessionId = document.getElementById('sessionIdInput').value.trim();

  if (!studentName || !sessionId) {
    studentMsg.textContent = "Please enter your name and session ID.";
    studentMsg.className = "error-msg";
    return;
  }

  db.ref(`sessions/${sessionId}`).get().then(snapshot => {
    if (!snapshot.exists()) {
      studentMsg.textContent = "Invalid session ID.";
      studentMsg.className = "error-msg";
      return;
    }

    db.ref(`attendance/${sessionId}`).orderByChild('name').equalTo(studentName).get()
      .then(attSnap => {
        if (attSnap.exists()) {
          studentMsg.textContent = "Attendance already marked for this session.";
          studentMsg.className = "error-msg";
          return;
        }

        const attendanceRef = db.ref(`attendance/${sessionId}`).push();
        attendanceRef.set({
          name: studentName,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
          studentMsg.textContent = "Attendance marked successfully. Thank you!";
          studentMsg.className = "success-msg";
          studentForm.reset();
        }).catch(err => {
          studentMsg.textContent = "Error marking attendance: " + err.message;
          studentMsg.className = "error-msg";
        });
      });
  }).catch(err => {
    studentMsg.textContent = "Error verifying session: " + err.message;
    studentMsg.className = "error-msg";
  });
});

// Load sessions
function loadSessionsToAdminSelect() {
  adminSessionSelect.innerHTML = '<option value="" disabled selected>-- Select Session --</option>';
  db.ref('sessions').once('value').then(snapshot => {
    snapshot.forEach(childSnap => {
      const s = childSnap.val();
      const option = document.createElement('option');
      option.value = childSnap.key;
      option.textContent = `${s.name} (${s.date} ${s.time})`;
      adminSessionSelect.appendChild(option);
    });
  });
}

// Show attendance list
adminSessionSelect.addEventListener('change', () => {
  const sessionId = adminSessionSelect.value;
  attendanceListContainer.innerHTML = '';
  downloadCSVBtn.style.display = 'none';

  if (!sessionId) return;

  db.ref(`attendance/${sessionId}`).once('value').then(snapshot => {
    if (!snapshot.exists()) {
      attendanceListContainer.innerHTML = "<p>No attendance records for this session yet.</p>";
      return;
    }

    const records = [];
    snapshot.forEach(childSnap => {
      const rec = childSnap.val();
      records.push({ name: rec.name, timestamp: new Date(rec.timestamp).toLocaleString() });
    });

    const table = document.createElement('table');
    table.innerHTML = "<thead><tr><th>#</th><th>Student Name</th><th>Timestamp</th></tr></thead>";
    const tbody = document.createElement('tbody');
    records.forEach((record, i) => {
      tbody.innerHTML += `<tr><td>${i + 1}</td><td>${record.name}</td><td>${record.timestamp}</td></tr>`;
    });
    table.appendChild(tbody);

    attendanceListContainer.appendChild(table);
    downloadCSVBtn.style.display = 'inline-block';

    downloadCSVBtn.records = records;
    downloadCSVBtn.sessionName = adminSessionSelect.options[adminSessionSelect.selectedIndex].text;
  });
});

// Download CSV
downloadCSVBtn.addEventListener('click', () => {
  const records = downloadCSVBtn.records;
  if (!records || records.length === 0) return;

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "No,Student Name,Timestamp\n";
  records.forEach((record, i) => {
    csvContent += `${i + 1},"${record.name}","${record.timestamp}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const safeName = downloadCSVBtn.sessionName.replace(/[^\w]/g, '_');
  link.setAttribute("download", `attendance_${safeName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// Default date = today
document.getElementById('sessionDate').valueAsDate = new Date();
