<?php
//Track24 2013
//Author : Steven Crawford
// Co-Author Masoud Omran
//G.U.I v2.5
//ASTRO get acknowledged users

session_start(); include $_SESSION['SYSCON_URL'];
				
	if($_SESSION['SESS_ACCOUNT_TYPE'] == 'client'){
		$owner = $_SESSION['SESS_CLIENT_ID'];
		
	}//end IF

	if ($_SESSION['SESS_ACCOUNT_TYPE'] == 'user') {
		$owner = 'u' . $_SESSION['USR_USER_ID'];
	}
		//end IF			
		
	$panicId= $_GET['panicId'];
	
	$qryPanicAck = sprintf("SELECT * FROM PanicAck WHERE panic_id= %d", $panicId);
							
	$resultPanicAck = mysql_query($qryPanicAck);
	
	$returnPanicAck=array();
	
	if($resultPanicAck){		
		while($row = mysql_fetch_array($resultPanicAck)){
			$returnPanicAck[]= $row;
		}
	}//end IF
	
	if(!$resultPanicAck){
				
	}//end IF
	
	echo json_encode($returnPanicAck); //,"CHKsetAcknowls_2" => $CHKsetAcknowls_2
	
	unset($_GET['panicId']);
	exit();
		
?>